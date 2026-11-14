"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_COOKIE, createAdminToken, requireAdmin, revokeAllAdminSessions, revokeCurrentAdminSession, revokeOtherAdminSessions } from "@/lib/auth/admin-session";
import { serverEnv } from "@/lib/env";
import { activateUntil, renewForOneMonth, setStatus, changeEndDate, getCurrentSubscription, saveExistingMember } from "@/lib/subscriptions";
import { auditLog, botLog, safeAuditLog } from "@/lib/logs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInviteLink, markInviteDeliveryError, markInviteSent, sendMessage, testTelegramGroup } from "@/lib/telegram/api";
import { runBotHealthCheck } from "@/lib/telegram/health";
import { checkRateLimit, requestIp } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/origin";
import { safeEqual } from "@/lib/security/secrets";
import { canSendInvite, renewalNeedsInvite, sendInviteRejectionMessage } from "@/lib/subscription-rules";
import { validatePaymentDuration } from "@/lib/payment-validation";
import { isTelegramRateLimitError, telegramErrorMetadata } from "@/lib/telegram/error-metadata";
import { messagesFor } from "@/lib/telegram/messages";
import { attemptExpulsion, checkExpired } from "@/lib/cron/checkExpired";
import { quickExpiryPresetValues, quickSubscriptionEndDate } from "@/lib/subscription-dates";
import { manualExpelUser, manualUnbanUser } from "@/lib/manual-expel";
import { assertNotReadOnly, hasReadOnlyDisableConfirmation, requiresReadOnlyDisableConfirmation } from "@/lib/admin/modes";
import { parseCheckbox } from "@/lib/form";

const userSchema = z.string().uuid();
class InviteDeliveryError extends Error {
  constructor(message: string, readonly metadata: Record<string, unknown>) {
    super(message);
    this.name = "InviteDeliveryError";
  }
}
class InviteTrackingError extends Error {
  constructor(message: string, readonly metadata: Record<string, unknown>) {
    super(message);
    this.name = "InviteTrackingError";
  }
}
function safeReturnTo(value: unknown) {
  if (typeof value !== "string") return "/admin/vip-guard/users";
  if (value === "/admin") return value;
  if (value === "/admin/vip-guard/incidents") return value;
  return value.startsWith("/admin/vip-guard/users") ? value : "/admin/vip-guard/users";
}
function withError(path: string, error: string, userId?: string) {
  const url = new URL(path, "https://vip-guard.local");
  url.searchParams.set("error", error);
  if (userId) url.searchParams.set("user", userId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
function revalidateUserViews(userId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/vip-guard/users");
  revalidatePath(`/admin/vip-guard/users/${userId}`);
  revalidatePath("/admin/vip-guard/subscriptions");
  revalidatePath("/admin/vip-guard/logs");
}
function revalidateOperationalViews(userId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/vip-guard/users");
  revalidatePath("/admin/vip-guard/incidents");
  revalidatePath("/admin/vip-guard/subscriptions");
  revalidatePath("/admin/vip-guard/logs");
  if (userId) revalidatePath(`/admin/vip-guard/users/${userId}`);
}
function inviteDeliveryErrorCode(error: InviteDeliveryError | InviteTrackingError, fallback: string) {
  if ("metadata" in error && Number(error.metadata.telegram_error_code) === 429) return "telegram_rate_limited";
  if ("metadata" in error && typeof error.metadata.retry_after === "number") return "telegram_rate_limited";
  if ("metadata" in error && error.metadata.method === "createChatInviteLink") return "telegram_invite_permission";
  return fallback;
}
function controlledAdminErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Configura primero un grupo VIP activo")) return "missing_active_group";
  if (message.includes("Configura un grupo VIP antes de validar usuarios")) return "missing_active_group";
  if (message.includes("TELEGRAM_GROUP_CHAT_ID")) return "telegram_group_chat_id_invalid";
  return null;
}
function activationDurationFromForm(action: string, form: FormData) {
  if (action === "activate_7d") return { type: "days" as const, days: 7 };
  if (action === "activate_15d") return { type: "days" as const, days: 15 };
  if (action === "activate_3m") return { type: "months" as const, months: 3 };
  if (action === "activate_custom") {
    const customEndsAt = z.string().trim().optional().or(z.literal("")).parse(form.get("customEndsAt") ?? "");
    if (customEndsAt) {
      const endsAt = new Date(customEndsAt);
      if (Number.isNaN(endsAt.getTime()) || endsAt <= new Date()) throw new Error("La caducidad debe estar en el futuro.");
      return { type: "until" as const, endsAt };
    }
    const days = z.coerce.number().int().min(1).max(730).parse(form.get("customDays"));
    return { type: "days" as const, days };
  }
  return { type: "months" as const, months: 1 };
}
function groupTestRedirect(result: Awaited<ReturnType<typeof testTelegramGroup>>) {
  const params = groupTestParams(result);
  return `/admin/vip-guard/settings?${params.toString()}`;
}
function groupTestParams(result: Awaited<ReturnType<typeof testTelegramGroup>>) {
  const params = new URLSearchParams({
    group_test: result.ok ? "ok" : "failed",
    group_found: String(result.groupFound),
    chat_title: result.chatTitle ?? "",
    bot_inside: String(result.botInside),
    bot_admin: String(result.botAdmin),
    can_create_invite: String(result.canCreateInvite),
    can_restrict_members: String(result.canRestrictMembers)
  });
  if (result.errorMessage) params.set("group_error", result.errorMessage.slice(0, 240));
  return params;
}
function settingsErrorRedirect(result: Awaited<ReturnType<typeof testTelegramGroup>>, reason?: string) {
  const params = groupTestParams(result);
  params.set("settings_error", reason ?? "group_check_failed");
  return `/admin/vip-guard/settings?${params.toString()}`;
}
async function enforceActionLimit() {
  const incoming = await headers();
  if (!(await checkRateLimit(`admin-action:${requestIp(incoming)}`, 60, 60_000)).allowed) throw new Error("Demasiadas acciones. Espera un minuto.");
}
async function updateOperationalStatus(userId: string, operationalStatus: string) {
  const { error } = await createAdminClient().from("telegram_users").update({ operational_status: operationalStatus }).eq("id", userId);
  if (error) throw error;
}
function deliveryFailureStatus(error: unknown) {
  if (isTelegramRateLimitError(error)) return "retry_pending";
  const message = error instanceof Error ? error.message : String(error);
  return /blocked|forbidden|bot was blocked|user is deactivated/i.test(message) ? "bot_blocked" : "invite_delivery_failed";
}
async function createTelegramRateLimitIncident(input: { userId: string; groupId?: string | null; subscriptionId?: string | null; metadata: Record<string, unknown>; title?: string }) {
  const { error } = await createAdminClient().from("operational_incidents").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.groupId ?? null,
    subscription_id: input.subscriptionId ?? null,
    severity: "warning",
    status: "open",
    code: "telegram_rate_limited",
    title: input.title ?? "Telegram limitó temporalmente el envío.",
    description: "Telegram devolvió 429/retry_after. Reintenta la acción cuando pase la ventana indicada; el enlace vigente se reutiliza.",
    metadata: input.metadata
  });
  if (error) console.error("telegram_rate_limit_incident_failed", error);
}
async function createPrivateMessageIncident(input: { userId: string; groupId?: string | null; subscriptionId?: string | null; metadata: Record<string, unknown>; title?: string }) {
  const { error } = await createAdminClient().from("operational_incidents").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.groupId ?? null,
    subscription_id: input.subscriptionId ?? null,
    severity: "warning",
    status: "open",
    code: "private_message_failed",
    title: input.title ?? "No se pudo enviar aviso privado; el usuario no abrió el bot",
    description: "Telegram no permitió enviar un mensaje privado. Pide al usuario que abra el bot y pulse /start. El proceso no se interrumpe.",
    metadata: input.metadata
  });
  if (error) console.error("private_message_incident_failed", error);
}
async function deliverInvite(userId: string, subscription: { id?: string; vip_group_id: string; status?: string | null; ends_at?: string | null }) {
  const db = createAdminClient();
  const [{ data: user, error: userError }, { data: group, error: groupError }] = await Promise.all([
    db.from("telegram_users").select("*").eq("id", userId).single(),
    db.from("vip_groups").select("*").eq("id", subscription.vip_group_id).single()
  ]);
  if (userError || groupError) throw userError ?? groupError;
  if (!canSendInvite(subscription)) throw new InviteDeliveryError(sendInviteRejectionMessage(subscription) ?? "No se puede enviar enlace: la suscripción no está activa.", {
    method: "createChatInviteLink",
    chat_id: group.telegram_chat_id,
    telegram_user_id: user.telegram_user_id,
    subscription_id: subscription.id,
    error_message: "inactive_subscription",
    error_name: "InactiveSubscription",
    telegram_description: null
  });
  let invite: Awaited<ReturnType<typeof createInviteLink>>;
  try { invite = await createInviteLink(userId, group, undefined, subscription.ends_at, subscription.id ?? null); }
  catch (error) {
    const metadata = telegramErrorMetadata(error, { method: "createChatInviteLink", chat_id: group.telegram_chat_id, telegram_user_id: user.telegram_user_id, subscription_id: subscription.id });
    await botLog("telegram_error", "Telegram rechazó la creación de un enlace privado", { userId, groupId: group.id, level: "error", metadata });
    await auditLog("invite_create_failed", "No se pudo crear el enlace privado", userId, metadata);
    await updateOperationalStatus(userId, "invite_not_sent");
    throw new InviteDeliveryError("No se pudo crear el enlace privado.", metadata);
  }
  await auditLog(invite.reused ? "invite_reused" : "invite_generated", invite.reused ? "Enlace privado vigente reutilizado" : "Enlace privado generado", userId, { invite_link_id: invite.id, expire_at: invite.expire_at });
  try {
    const messageContext = {
      nombreGrupo: group.public_name ?? group.name ?? null,
      contactoAdmin: group.admin_contact ?? null,
      instruccionesPago: group.payment_instructions ?? null,
      bienvenida: group.welcome_text ?? null,
      renovacion: group.renewal_text ?? null,
      soporte: group.support_text ?? null
    };
    await sendMessage(user.telegram_user_id, messagesFor(user.language_code).inviteSent(invite.invite_link, messageContext));
  } catch (error) {
    const metadata = telegramErrorMetadata(error, { method: "sendMessage", chat_id: user.telegram_user_id, telegram_user_id: user.telegram_user_id, subscription_id: subscription.id });
    const rateLimited = isTelegramRateLimitError(error);
    await botLog(rateLimited ? "telegram_rate_limited" : "telegram_error", rateLimited ? "Telegram pidió reintentar más tarde el envío del enlace" : "Telegram rechazó el envío del enlace privado", { userId, groupId: group.id, level: rateLimited ? "warning" : "error", metadata });
    await auditLog(rateLimited ? "invite_send_retry_pending" : "invite_send_failed", rateLimited ? "Envío de enlace pendiente por rate limit de Telegram" : "No se pudo enviar el enlace privado", userId, metadata);
    try { await markInviteDeliveryError(invite.id, rateLimited ? `rate_limited retry_after=${metadata.retry_after ?? "unknown"}` : String(metadata.telegram_description ?? metadata.error_message)); } catch (markError) { console.error("invite_delivery_error_mark_failed", markError); }
    await updateOperationalStatus(userId, deliveryFailureStatus(error));
    if (rateLimited) await createTelegramRateLimitIncident({ userId, groupId: group.id, subscriptionId: subscription.id ?? null, metadata: { ...metadata, invite_link_id: invite.id }, title: "Telegram limitó el envío del enlace privado." });
    else await createPrivateMessageIncident({ userId, groupId: group.id, subscriptionId: subscription.id ?? null, metadata: { ...metadata, invite_link_id: invite.id }, title: "No se pudo enviar el enlace privado; el usuario no abrió el bot" });
    throw new InviteDeliveryError("No se pudo enviar el enlace privado.", metadata);
  }
  await updateOperationalStatus(userId, "invite_sent_pending_join");
  try {
    await markInviteSent(invite.id);
  } catch (error) {
    const metadata = telegramErrorMetadata(error, { method: "markInviteSent", chat_id: user.telegram_user_id, telegram_user_id: user.telegram_user_id, subscription_id: subscription.id });
    await botLog("invite_mark_sent_failed", "El enlace se envió, pero no se pudo marcar como enviado", { userId, groupId: group.id, level: "error", metadata: { ...metadata, invite_link_id: invite.id } });
    await auditLog("invite_mark_sent_failed", "El enlace se envió, pero no se pudo marcar como enviado", userId, { ...metadata, invite_link_id: invite.id });
    throw new InviteTrackingError("El enlace se envió, pero no se pudo marcar como enviado.", metadata);
  }
  await auditLog("invite_sent", "Enlace privado enviado por Telegram", userId);
}
export async function loginAction(form: FormData) {
  await assertSameOrigin();
  const incoming = await headers(), ip = requestIp(incoming);
  if (!(await checkRateLimit(`admin-login:${ip}`, 5, 15 * 60_000)).allowed) { await safeAuditLog("admin_login_rate_limited", "Login admin bloqueado temporalmente por exceso de intentos"); redirect("/admin/login?error=rate"); }
  if (!safeEqual(form.get("password"), serverEnv().ADMIN_PASSWORD)) { await safeAuditLog("admin_login_failed", "Intento fallido de login admin"); redirect("/admin/login?error=1"); }
  let token: string;
  try {
    token = await createAdminToken({ userAgent: incoming.get("user-agent"), ip });
  } catch (error) {
    console.error("admin_login_session_failed", error);
    redirect("/admin/login?error=config");
  }
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 43_200 });
  await safeAuditLog("admin_login_success", "Login admin correcto");
  redirect("/admin");
}
export async function logoutAction() { await assertSameOrigin(); await requireAdmin(); await revokeCurrentAdminSession(); await auditLog("admin_logout", "Sesión admin cerrada"); (await cookies()).delete(ADMIN_COOKIE); redirect("/admin/login"); }
export async function logoutAllSessionsAction() { await assertSameOrigin(); await requireAdmin(); await revokeAllAdminSessions(); await auditLog("admin_logout_all", "Todas las sesiones admin fueron revocadas"); (await cookies()).delete(ADMIN_COOKIE); redirect("/admin/login"); }
export async function logoutOtherSessionsAction() { await assertSameOrigin(); await requireAdmin(); await revokeOtherAdminSessions(); await auditLog("admin_logout_other", "Otras sesiones admin fueron revocadas"); revalidatePath("/admin"); }
async function done(action: string, userId: string, message: string) { await auditLog(action, message, userId); revalidateUserViews(userId); }
export async function userAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly(); const userId = userSchema.parse(form.get("userId")); const action = z.enum(["activate","activate_7d","activate_15d","activate_3m","activate_custom","renew","pending","expired","cancelled","send_invite","kick","unban","retry_expulsion","resolve_expulsion"]).parse(form.get("action")); const returnTo = safeReturnTo(form.get("returnTo"));
  if (action === "activate" || action === "activate_7d" || action === "activate_15d" || action === "activate_3m" || action === "activate_custom") {
    try {
      const current = await getCurrentSubscription(userId);
      if (current?.status === "active" && current.ends_at && new Date(current.ends_at) > new Date()) {
        await auditLog("manual_payment_already_active", "Validación ignorada: el usuario ya tiene una suscripción activa.", userId, { subscription_id: current.id, ends_at: current.ends_at });
        redirect(withError(returnTo, "already_active", userId));
      }
      await validatePaymentDuration(userId, activationDurationFromForm(action, form), deliverInvite);
      revalidateUserViews(userId); return;
    } catch (error) {
      if (error instanceof InviteDeliveryError || error instanceof InviteTrackingError) {
        await auditLog("manual_payment_invite_failed", "Pago validado, enlace no entregado", userId, error.metadata);
        await botLog("manual_payment_invite_failed", "Pago validado, enlace no entregado", { userId, level: "error", metadata: error.metadata });
        revalidateUserViews(userId);
        redirect(withError(returnTo, inviteDeliveryErrorCode(error, error instanceof InviteTrackingError ? "invite_mark_failed" : "payment_validated_invite_failed"), userId));
      }
      const code = controlledAdminErrorCode(error);
      if (code) {
        await auditLog("manual_payment_configuration_failed", "No se pudo validar el pago por configuración incompleta", userId, { error_code: code, error_message: error instanceof Error ? error.message : String(error) });
        revalidateUserViews(userId);
        redirect(withError(returnTo, code, userId));
      }
      throw error;
    }
  }
  if (action === "renew") {
    try {
      const previous = await getCurrentSubscription(userId);
      const subscription = await renewForOneMonth(userId);
      const wasInactive = renewalNeedsInvite(new Date(), previous?.status, previous?.ends_at);
      await auditLog("renew", wasInactive ? "Acceso renovado por 1 mes desde ahora" : "Acceso renovado por 1 mes desde su caducidad", userId);
      if (wasInactive) {
        await botLog("user_renewed_after_expiration", "Usuario inactivo renovado y preparado para volver al grupo", { userId, groupId: subscription.vip_group_id });
        try { await deliverInvite(userId, subscription); }
        catch (error) { if (error instanceof InviteDeliveryError || error instanceof InviteTrackingError) redirect(withError(returnTo, inviteDeliveryErrorCode(error, error instanceof InviteTrackingError ? "invite_mark_failed" : "invite_delivery_failed"), userId)); const code = controlledAdminErrorCode(error); if (code) redirect(withError(returnTo, code, userId)); throw error; }
      }
      revalidateUserViews(userId); return;
    } catch (error) {
      const code = controlledAdminErrorCode(error);
      if (code) {
        await auditLog("renew_configuration_failed", "No se pudo renovar por configuración incompleta", userId, { error_code: code, error_message: error instanceof Error ? error.message : String(error) });
        revalidateUserViews(userId);
        redirect(withError(returnTo, code, userId));
      }
      throw error;
    }
  }
  if (["pending","expired","cancelled"].includes(action)) {
    if (action === "cancelled") {
      const confirmation = z.string().trim().transform((value) => value.toUpperCase()).parse(form.get("cancel_confirmation") ?? "");
      if (confirmation !== "CANCELAR") {
        await auditLog("subscription_cancel_rejected", "Cancelación de suscripción rechazada por falta de confirmación fuerte", userId);
        redirect(withError(returnTo, "subscription_cancel_confirmation_required", userId));
      }
    }
    await setStatus(userId, action as "pending"|"expired"|"cancelled"); await done(action, userId, `Estado cambiado a ${action}`); return;
  }
  if (action === "kick") {
    const current = await getCurrentSubscription(userId);
    if (current?.status === "active" && current.ends_at && new Date(current.ends_at) > new Date()) {
      const confirmation = z.string().trim().transform((value) => value.toUpperCase()).parse(form.get("kick_confirmation") ?? "");
      const reason = z.string().trim().max(500).optional().or(z.literal("")).parse(form.get("kick_reason") ?? "") || null;
      if (confirmation !== "EXPULSAR") {
        await auditLog("manual_expel_active_rejected", "Expulsión de usuario activo rechazada por falta de confirmación fuerte", userId, { ends_at: current.ends_at, reason });
        redirect(withError(returnTo, "manual_expel_active_confirmation_required", userId));
      }
      await auditLog("manual_expel_active_confirmed", "Expulsión manual de usuario con acceso activo confirmada", userId, { ends_at: current.ends_at, reason });
    }
    const result = await manualExpelUser(userId);
    revalidateOperationalViews(userId);
    if (!result.ok) redirect(withError(returnTo, result.uiError ?? "manual_expel_failed", userId));
    return;
  }
  if (action === "unban") {
    const result = await manualUnbanUser(userId);
    revalidateOperationalViews(userId);
    if (!result.ok) redirect(withError(returnTo, result.uiError ?? "manual_unban_failed", userId));
    return;
  }
  const db = createAdminClient();
  const sub = await getCurrentSubscription(userId);
  if (!sub) {
    if (action === "send_invite") {
      const message = sendInviteRejectionMessage(null) ?? "No se puede enviar enlace: el usuario no tiene una suscripción activa.";
      await botLog("invite_rejected_inactive_subscription", message, { userId, level: "warning", metadata: { subscription_id: null, status: null, ends_at: null } });
      await auditLog("invite_rejected_inactive_subscription", message, userId, { subscription_id: null, status: null, ends_at: null });
      redirect(withError(returnTo, "invite_inactive", userId));
    }
    throw new Error("Activa primero la suscripción");
  }
  if (action === "retry_expulsion" || action === "resolve_expulsion") {
    const { data: fullSub, error: fullSubError } = await db.from("subscriptions").select("*, telegram_users(*), vip_groups(*)").eq("id", sub.id).single();
    if (fullSubError) throw fullSubError;
    if (action === "retry_expulsion") {
      const result = await attemptExpulsion(fullSub);
      await auditLog("manual_expulsion_retry", "Reintento manual de expulsión por caducidad", userId, { subscription_id: sub.id, result });
      revalidateOperationalViews(userId);
      return;
    }
    const { error: updateError } = await db.from("subscriptions").update({ expulsion_status: "resolved_manual", last_expulsion_error: null }).eq("id", sub.id);
    if (updateError) throw updateError;
    await updateOperationalStatus(userId, "resolved_manual");
    await botLog("manual_expulsion_resolved", "Incidencia de expulsión marcada como resuelta manualmente", { userId, groupId: sub.vip_group_id, metadata: { subscription_id: sub.id } });
    await auditLog("manual_expulsion_resolved", "Incidencia de expulsión marcada como resuelta manualmente", userId, { subscription_id: sub.id });
    revalidateOperationalViews(userId);
    return;
  }
  if (action === "send_invite" && !canSendInvite(sub)) {
    const message = sendInviteRejectionMessage(sub) ?? "No se puede enviar enlace: la suscripción no está activa.";
    const metadata = { subscription_id: sub.id, status: sub.status, ends_at: sub.ends_at };
    await botLog("invite_rejected_inactive_subscription", message, { userId, groupId: sub.vip_group_id, level: "warning", metadata });
    await auditLog("invite_rejected_inactive_subscription", message, userId, metadata);
    redirect(withError(returnTo, "invite_inactive", userId));
  }
  try { await deliverInvite(userId, sub); }
  catch (error) { if (error instanceof InviteDeliveryError || error instanceof InviteTrackingError) redirect(withError(returnTo, inviteDeliveryErrorCode(error, error instanceof InviteTrackingError ? "invite_mark_failed" : "invite_delivery_failed"), userId)); const code = controlledAdminErrorCode(error); if (code) redirect(withError(returnTo, code, userId)); throw error; }
  revalidateUserViews(userId);
}
const reasonSchema = z.string().trim().max(500).optional().or(z.literal(""));

export async function incidentAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const parsed = z.object({
    incidentId: z.string().uuid(),
    status: z.enum(["investigating", "resolved", "ignored"]),
    resolutionNote: z.string().trim().max(1_000).optional().or(z.literal(""))
  }).parse({
    incidentId: form.get("incidentId"),
    status: form.get("status"),
    resolutionNote: form.get("resolutionNote") ?? ""
  });
  const payload: Record<string, unknown> = { status: parsed.status };
  if (parsed.status === "resolved" || parsed.status === "ignored") {
    payload.resolved_at = new Date().toISOString();
    payload.resolved_by = "admin";
    payload.resolution_note = parsed.resolutionNote || null;
  }
  const { error } = await createAdminClient().from("operational_incidents").update(payload).eq("id", parsed.incidentId);
  if (error) throw error;
  await auditLog("operational_incident_status_changed", "Incidencia operativa actualizada", undefined, { incident_id: parsed.incidentId, status: parsed.status });
  revalidatePath("/admin/vip-guard/incidents");
}

export async function endDateAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const userId = userSchema.parse(form.get("userId"));
  const end = z.string().min(10).refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha inválida").parse(form.get("endsAt"));
  const reason = reasonSchema.parse(form.get("reason") ?? "") || null;
  const expectedUpdatedAt = z.string().optional().or(z.literal("")).parse(form.get("expectedUpdatedAt") ?? "") || null;
  const current = await getCurrentSubscription(userId);
  await changeEndDate(userId, end, expectedUpdatedAt);
  const newEnd = new Date(end).toISOString();
  await auditLog("change_end", "Caducidad modificada manualmente", userId, {
    previous_ends_at: current?.ends_at ?? null,
    new_ends_at: newEnd,
    reason
  });
  revalidateUserViews(userId);
}

export async function quickEndDateAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const userId = userSchema.parse(form.get("userId"));
  const preset = z.enum(quickExpiryPresetValues).parse(form.get("preset"));
  const reason = reasonSchema.parse(form.get("reason") ?? "") || null;
  const expectedUpdatedAt = z.string().optional().or(z.literal("")).parse(form.get("expectedUpdatedAt") ?? "") || null;
  const current = await getCurrentSubscription(userId);
  if (!current) throw new Error("El usuario no tiene suscripción");
  const newEnd = quickSubscriptionEndDate(preset, current, new Date());
  await changeEndDate(userId, newEnd.toISOString(), expectedUpdatedAt);
  await auditLog("quick_change_end", "Caducidad modificada con botón rápido", userId, {
    preset,
    previous_ends_at: current.ends_at ?? null,
    new_ends_at: newEnd.toISOString(),
    base: current.status === "active" && current.ends_at && new Date(current.ends_at) > new Date() ? "ends_at" : "now",
    reason
  });
  revalidateUserViews(userId);
}
export async function migrationActivationAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const parsed = z.object({ userId: z.string().uuid(), endsAt: z.string().min(10).transform((value, ctx) => { const date = new Date(value); if (Number.isNaN(date.getTime()) || date <= new Date()) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fecha debe estar en el futuro" }); return z.NEVER; } return date; }) }).parse({ userId: form.get("userId"), endsAt: form.get("endsAt") });
  await activateUntil(parsed.userId, parsed.endsAt);
  await auditLog("migration_activate_exact_date", "Usuario de migración activado con fecha exacta", parsed.userId, { endsAt: parsed.endsAt.toISOString() });
  revalidatePath("/admin/vip-guard/migration"); revalidateUserViews(parsed.userId);
}
export async function existingMemberAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().datetime().transform((value) => new Date(value)).optional());
  const parsed = z.object({
    telegramUserId: z.coerce.number().int().positive().safe(),
    telegramUsername: z.string().trim().max(32).regex(/^@?[A-Za-z0-9_]{5,32}$/, "Username inválido").optional().or(z.literal("")),
    memberSince: z.string().datetime().transform((value) => new Date(value)),
    endsAt: optionalDate,
    internalNotes: z.string().trim().max(5_000)
  }).superRefine((value, ctx) => {
    if (value.endsAt && value.endsAt <= new Date()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "La caducidad debe estar en el futuro" });
    if (value.endsAt && value.memberSince >= value.endsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memberSince"], message: "La fecha de alta debe ser anterior a la caducidad" });
  }).parse({
    telegramUserId: form.get("telegramUserId"),
    telegramUsername: form.get("telegramUsername") ?? "",
    memberSince: form.get("memberSince"),
    endsAt: form.get("endsAt") ?? "",
    internalNotes: form.get("internalNotes") ?? ""
  });
  const result = await saveExistingMember(parsed);
  await auditLog(parsed.endsAt ? "existing_member_created_confirmed" : "existing_member_review_confirmed", "Migración manual confirmada desde dashboard", result.user.id, {
    member_since: parsed.memberSince.toISOString(),
    ends_at: parsed.endsAt?.toISOString() ?? null,
    subscription_status: result.subscription.status,
    no_invite_sent: true
  });
  revalidatePath("/admin/vip-guard/migration"); revalidateUserViews(result.user.id);
}
export async function updateUserProfileAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const parsed = z.object({ userId: z.string().uuid(), internalNotes: z.string().trim().max(5_000), tags: z.string().max(1_000) }).parse({ userId: form.get("userId"), internalNotes: form.get("internalNotes") ?? "", tags: form.get("tags") ?? "" });
  const tags = [...new Set(parsed.tags.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  const db = createAdminClient();
  const { data: before, error: readError } = await db.from("telegram_users").select("internal_notes,tags").eq("id", parsed.userId).single(); if (readError) throw readError;
  const { error } = await db.from("telegram_users").update({ internal_notes: parsed.internalNotes || null, tags }).eq("id", parsed.userId); if (error) throw error;
  if ((before.internal_notes ?? "") !== parsed.internalNotes) await auditLog("internal_notes_changed", "Notas internas actualizadas", parsed.userId);
  if (JSON.stringify(before.tags ?? []) !== JSON.stringify(tags)) await auditLog("tags_changed", "Etiquetas actualizadas", parsed.userId, { tags });
  revalidatePath(`/admin/vip-guard/users/${parsed.userId}`); revalidatePath("/admin/vip-guard/users");
}
export async function settingsAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); const textField = z.string().trim().max(2_000).optional().or(z.literal("")); const uppercaseField = z.string().trim().transform((value) => value.toUpperCase()).optional().or(z.literal("")); const parsed = z.object({ name: z.string().trim().min(2).max(100), telegram_chat_id: z.coerce.number().int().negative(), is_active: z.boolean(), automatic_expulsion_enabled: z.boolean(), beta_mode: z.boolean(), read_only_mode: z.boolean(), group_change_confirmation: uppercaseField, read_only_confirmation: z.string().trim().optional().or(z.literal("")), read_only_password: z.string().optional().or(z.literal("")), public_name: z.string().trim().max(100).optional().or(z.literal("")), admin_contact: textField, payment_instructions: textField, welcome_text: textField, renewal_text: textField, support_text: textField }).parse({ name: form.get("name"), telegram_chat_id: form.get("telegram_chat_id"), is_active: parseCheckbox(form, "is_active"), automatic_expulsion_enabled: parseCheckbox(form, "automatic_expulsion_enabled"), beta_mode: parseCheckbox(form, "beta_mode"), read_only_mode: parseCheckbox(form, "read_only_mode"), group_change_confirmation: form.get("group_change_confirmation") ?? "", read_only_confirmation: form.get("read_only_confirmation") ?? "", read_only_password: form.get("read_only_password") ?? "", public_name: form.get("public_name") ?? "", admin_contact: form.get("admin_contact") ?? "", payment_instructions: form.get("payment_instructions") ?? "", welcome_text: form.get("welcome_text") ?? "", renewal_text: form.get("renewal_text") ?? "", support_text: form.get("support_text") ?? "" });
  const db = createAdminClient(); const { data } = await db.from("vip_groups").select("id,telegram_chat_id,read_only_mode,automatic_expulsion_enabled").limit(1).maybeSingle();
  const disablingReadOnly = requiresReadOnlyDisableConfirmation(Boolean(data?.read_only_mode), parsed.read_only_mode);
  const readOnlyChanged = Boolean(data?.read_only_mode) !== parsed.read_only_mode;
  if (disablingReadOnly && !hasReadOnlyDisableConfirmation(parsed.read_only_confirmation)) {
    await auditLog("settings_read_only_disable_rejected", "Desactivación de solo lectura rechazada por falta de confirmación fuerte", undefined, { previous_read_only_mode: data?.read_only_mode ?? null });
    redirect("/admin/vip-guard/settings?settings_error=read_only_disable_confirmation_required");
  }
  if (readOnlyChanged && !safeEqual(parsed.read_only_password, serverEnv().ADMIN_PASSWORD)) {
    await auditLog("settings_read_only_password_rejected", "Cambio de solo lectura rechazado por contraseña admin incorrecta", undefined, { previous_read_only_mode: data?.read_only_mode ?? null, next_read_only_mode: parsed.read_only_mode });
    redirect("/admin/vip-guard/settings?settings_error=read_only_password_required");
  }
  const groupChanged = data?.telegram_chat_id && Number(data.telegram_chat_id) !== parsed.telegram_chat_id;
  if (groupChanged && parsed.group_change_confirmation !== "CAMBIAR GRUPO") {
    await auditLog("settings_group_change_rejected", "Cambio de grupo rechazado por falta de confirmación fuerte", undefined, { previous_chat_id: data.telegram_chat_id, new_chat_id: parsed.telegram_chat_id });
    redirect("/admin/vip-guard/settings?settings_error=group_change_confirmation_required");
  }
  const test = await testTelegramGroup(parsed.telegram_chat_id);
  const health = await runBotHealthCheck(parsed.telegram_chat_id, data?.id ?? null);
  const enablingAutoExpulsion = parsed.automatic_expulsion_enabled && !data?.automatic_expulsion_enabled;
  const mustValidateGroup = !data || Boolean(groupChanged) || enablingAutoExpulsion;
  if ((!test.ok || !health.ok) && mustValidateGroup) {
    await auditLog("settings_group_check_failed", "No se guardó el grupo ni se activó la expulsión automática porque la prueba del bot/grupo falló", undefined, { test, health, group_changed: Boolean(groupChanged), enabling_auto_expulsion: enablingAutoExpulsion });
    redirect(settingsErrorRedirect(test));
  }
  const settings = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "group_change_confirmation" && key !== "read_only_confirmation" && key !== "read_only_password")) as Omit<typeof parsed, "group_change_confirmation" | "read_only_confirmation" | "read_only_password">;
  const payload = { ...settings, name: test.ok && test.chatTitle ? test.chatTitle : settings.name, public_name: parsed.public_name || (test.ok ? test.chatTitle : null) || null, admin_contact: parsed.admin_contact || null, payment_instructions: parsed.payment_instructions || null, welcome_text: parsed.welcome_text || null, renewal_text: parsed.renewal_text || null, support_text: parsed.support_text || null }; const query = data ? db.from("vip_groups").update(payload).eq("id", data.id) : db.from("vip_groups").insert(payload); const { error } = await query; if (error) throw error; await auditLog("settings", groupChanged ? "Grupo VIP cambiado con confirmación fuerte" : disablingReadOnly ? "Modo solo lectura desactivado con confirmación fuerte" : "Configuración del grupo actualizada", undefined, { group_changed: Boolean(groupChanged), read_only_disabled: disablingReadOnly, chat_title: test.chatTitle, telegram_chat_id: parsed.telegram_chat_id, health_ok: health.ok }); revalidatePath("/admin/vip-guard/settings"); revalidatePath("/admin"); if (!test.ok || !health.ok) { const params = groupTestParams(test); params.set("settings_warning", "group_check_failed_saved_texts"); redirect(`/admin/vip-guard/settings?${params.toString()}`); }
}

export async function groupTestAction(form: FormData) {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit();
  const chatId = z.coerce.number().int().negative().parse(form.get("telegram_chat_id"));
  const { data } = await createAdminClient().from("vip_groups").select("id").eq("telegram_chat_id", chatId).maybeSingle();
  const result = await runBotHealthCheck(chatId, data?.id ?? null);
  await auditLog(result.ok ? "telegram_group_test_ok" : "telegram_group_test_failed", result.ok ? "Prueba del grupo Telegram correcta" : "Prueba del grupo Telegram fallida", undefined, result);
  redirect(groupTestRedirect(result));
}

export async function runCheckExpiredAction() {
  await assertSameOrigin(); await requireAdmin(); await enforceActionLimit(); await assertNotReadOnly();
  const result = await checkExpired();
  await auditLog("manual_check_expired_run", "Cron de caducidades ejecutado manualmente desde el dashboard", undefined, result);
  revalidateOperationalViews();
}
