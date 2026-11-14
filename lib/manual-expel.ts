import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog, botLog } from "@/lib/logs";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { getEffectiveSubscriptionStatus } from "@/lib/services/subscription";
import { banUser, unbanUser } from "@/lib/telegram/api";
import { telegramErrorMetadata } from "@/lib/telegram/error-metadata";

type Db = ReturnType<typeof createAdminClient>;
type ManualExpelResult = {
  ok: boolean;
  status: "succeeded" | "failed" | "unban_failed" | "state_update_failed" | "precondition_failed" | "unexpected_error";
  uiError?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type Deps = {
  db: Db;
  ban: typeof banUser;
  unban: typeof unbanUser;
  botLog: typeof botLog;
  auditLog: typeof auditLog;
  now: () => Date;
};
type ManualSubscription = Record<string, unknown> & {
  id: string;
  telegram_user_id: string;
  vip_group_id: string;
  status: "pending" | "active" | "needs_manual_review" | "expired" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

const defaultDeps = (): Deps => ({
  db: createAdminClient(),
  ban: banUser,
  unban: unbanUser,
  botLog,
  auditLog,
  now: () => new Date()
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readManualSubscriptions(deps: Deps, userId: string): Promise<{ subscriptions: ManualSubscription[]; error: unknown }> {
  const query = deps.db.from("subscriptions")
    .select("*")
    .eq("telegram_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const result = typeof query === "object" && query !== null && "then" in query
    ? await (query as PromiseLike<{ data: ManualSubscription[] | null; error: unknown }>)
    : typeof query === "object" && query !== null && "maybeSingle" in query
      ? await (query as { maybeSingle: () => Promise<{ data: ManualSubscription | null; error: unknown }> }).maybeSingle()
      : { data: null, error: new Error("Invalid subscription query") };
  return { subscriptions: Array.isArray(result.data) ? result.data : result.data ? [result.data] : [], error: result.error };
}

function selectManualSubscription(subscriptions: ManualSubscription[], now: Date) {
  const activeGroups = new Set(
    subscriptions
      .filter((subscription) => getEffectiveSubscriptionStatus(subscription, now) === "active")
      .map((subscription) => subscription.vip_group_id)
      .filter(Boolean),
  );
  if (activeGroups.size > 1) {
    return { subscription: null, ambiguous: true };
  }
  return { subscription: selectCurrentSubscription(subscriptions, now), ambiguous: false };
}

async function safeBotLog(deps: Deps, ...args: Parameters<typeof botLog>) {
  try {
    await deps.botLog(...args);
  } catch (error) {
    console.error("manual_expel_bot_log_failed", error);
  }
}

async function safeAuditLog(deps: Deps, ...args: Parameters<typeof auditLog>) {
  try {
    await deps.auditLog(...args);
  } catch (error) {
    console.error("manual_expel_audit_log_failed", error);
  }
}

async function safeIncident(deps: Deps, payload: Record<string, unknown>) {
  try {
    const { error } = await deps.db.from("operational_incidents").insert(payload);
    if (error) throw error;
  } catch (error) {
    console.error("manual_expel_incident_failed", error);
  }
}

async function updateSubscription(deps: Deps, id: string, payload: Record<string, unknown>) {
  const { error } = await deps.db.from("subscriptions").update(payload).eq("id", id);
  if (error) throw error;
}

async function updateUser(deps: Deps, id: string, payload: Record<string, unknown>) {
  const { error } = await deps.db.from("telegram_users").update(payload).eq("id", id);
  if (error) throw error;
}

function baseMetadata(input: {
  telegramUserId?: string | number | null;
  vipGroupId?: string | null;
  chatId?: string | number | null;
  subscriptionId?: string | null;
  currentStep: string;
  finalStatus?: string;
}) {
  return {
    action: "manual_expel",
    telegram_user_id: input.telegramUserId ?? null,
    vip_group_id: input.vipGroupId ?? null,
    chat_id: input.chatId ?? null,
    subscription_id: input.subscriptionId ?? null,
    current_step: input.currentStep,
    expulsion_status_final: input.finalStatus ?? null
  };
}

type SafeKickInput = {
  action: "manual_expel" | "auto_expire_expel";
  userId: string;
  telegramUserId: string | number;
  vipGroupId: string;
  chatId: string | number;
  subscriptionId: string;
  expulsionAttempts?: number | null;
  successSubscriptionStatus?: "expired" | "cancelled";
};

function kickMetadata(input: SafeKickInput, currentStep: string, finalStatus?: string) {
  return {
    ...baseMetadata({
      telegramUserId: input.telegramUserId,
      vipGroupId: input.vipGroupId,
      chatId: input.chatId,
      subscriptionId: input.subscriptionId,
      currentStep,
      finalStatus
    }),
    action: input.action
  };
}

export async function safeKickAndUnbanUser(input: SafeKickInput, deps: Deps = defaultDeps()): Promise<ManualExpelResult> {
  const now = deps.now().toISOString();
  const successStatus = input.successSubscriptionStatus ?? "expired";

  try {
    const pendingMetadata = kickMetadata(input, "mark_pending", "pending");
    await updateSubscription(deps, input.subscriptionId, {
      expulsion_status: "pending",
      expulsion_attempts: Number(input.expulsionAttempts ?? 0) + 1,
      last_expulsion_attempt_at: now,
      last_expulsion_error: null
    });
    await updateUser(deps, input.userId, { operational_status: "expulsion_pending" });
    await safeBotLog(deps, input.action, "Expulsión iniciada", { userId: input.userId, groupId: input.vipGroupId, level: "warning", metadata: pendingMetadata });

    try {
      await deps.ban(input.chatId, input.telegramUserId);
    } catch (error) {
      const metadata: Record<string, unknown> = {
        ...kickMetadata(input, "telegram_ban", "failed"),
        ...telegramErrorMetadata(error, {
          method: "banChatMember",
          chat_id: input.chatId,
          telegram_user_id: input.telegramUserId,
          subscription_id: input.subscriptionId
        })
      };
      try {
        await updateSubscription(deps, input.subscriptionId, { expulsion_status: "failed", last_expulsion_error: metadata.error_message });
        await updateUser(deps, input.userId, { operational_status: "expulsion_failed" });
      } catch (stateError) {
        metadata.state_persisted = false;
        metadata.current_step = "persist_ban_failed";
        metadata.state_update_error_message = errorMessage(stateError);
        metadata.state_update_error_name = stateError instanceof Error ? stateError.name : "UnknownError";
        console.error("safe_kick_mark_ban_failed_state_error", stateError);
      }
      await safeBotLog(deps, "telegram_error", "Telegram rechazó la expulsión", { userId: input.userId, groupId: input.vipGroupId, level: "error", metadata });
      await safeAuditLog(deps, `${input.action}_failed`, "Expulsión fallida: Telegram rechazó banChatMember", input.userId, metadata);
      await safeIncident(deps, {
        telegram_user_id: input.userId,
        vip_group_id: input.vipGroupId,
        subscription_id: input.subscriptionId,
        severity: "error",
        code: `${input.action}_failed`,
        title: "Expulsión fallida",
        description: "Telegram rechazó banChatMember. Revisa permisos del bot.",
        metadata
      });
      return { ok: false, status: "failed", uiError: "manual_expel_failed", message: "Telegram rechazó la expulsión. Revisa permisos del bot.", metadata };
    }

    let unbanMetadata: Record<string, unknown>;
    try {
      await deps.unban(input.chatId, input.telegramUserId);
    } catch (error) {
      unbanMetadata = {
        critical: true,
        state_persisted: true,
        ...kickMetadata(input, "telegram_unban", "unban_failed"),
        ...telegramErrorMetadata(error, {
          method: "unbanChatMember",
          chat_id: input.chatId,
          telegram_user_id: input.telegramUserId,
          subscription_id: input.subscriptionId
        })
      };
      let statePersisted = true;
      try {
        await updateSubscription(deps, input.subscriptionId, {
          expulsion_status: "unban_failed",
          last_expulsion_error: unbanMetadata.error_message,
          expelled_at: now
        });
        await updateUser(deps, input.userId, { operational_status: "unban_failed" });
      } catch (stateError) {
        statePersisted = false;
        unbanMetadata.state_persisted = false;
        unbanMetadata.state_update_error_message = errorMessage(stateError);
        unbanMetadata.state_update_error_name = stateError instanceof Error ? stateError.name : "UnknownError";
        unbanMetadata.current_step = "persist_unban_failed";
        console.error("safe_kick_mark_unban_failed_state_error", stateError);
      }
      await safeBotLog(deps, "user_unban_failed_after_kick", "CRÍTICO: expulsión completada, pero el usuario continúa baneado", { userId: input.userId, groupId: input.vipGroupId, level: "error", metadata: unbanMetadata });
      await safeAuditLog(deps, `${input.action}_unban_failed`, "Expulsión completada, pero falló el desbloqueo posterior", input.userId, unbanMetadata);
      await safeIncident(deps, {
        telegram_user_id: input.userId,
        vip_group_id: input.vipGroupId,
        subscription_id: input.subscriptionId,
        severity: "critical",
        code: `${input.action}_unban_failed`,
        title: "Usuario posiblemente bloqueado tras expulsión",
        description: "banChatMember funcionó, pero unbanChatMember falló. Pulsa Intentar desbloquear o revisa Telegram manualmente.",
        metadata: unbanMetadata
      });
      if (!statePersisted) {
        return {
          ok: false,
          status: "state_update_failed",
          uiError: "manual_expel_unban_state_failed",
          message: "El usuario fue expulsado, falló el desbloqueo y además falló guardar el estado. Revisa Telegram manualmente.",
          metadata: unbanMetadata
        };
      }
      return { ok: false, status: "unban_failed", uiError: "manual_expel_unban_failed", message: "El usuario fue expulsado, pero pudo quedar baneado. Usa Intentar desbloquear.", metadata: unbanMetadata };
    }

    const successMetadata = kickMetadata(input, "persist_success", "succeeded");
    try {
      await updateSubscription(deps, input.subscriptionId, {
        status: successStatus,
        expulsion_status: "succeeded",
        last_expulsion_error: null,
        expelled_at: now,
        unbanned_after_kick_at: now
      });
      await updateUser(deps, input.userId, { operational_status: "expelled" });
    } catch (error) {
      const metadata = {
        ...successMetadata,
        error_message: errorMessage(error),
        error_name: error instanceof Error ? error.name : "UnknownError"
      };
      await safeBotLog(deps, `${input.action}_state_update_failed`, "Expulsión y desbloqueo completados, pero falló actualizar Supabase", { userId: input.userId, groupId: input.vipGroupId, level: "error", metadata });
      await safeAuditLog(deps, `${input.action}_state_update_failed`, "Expulsión y desbloqueo completados, pero falló actualizar Supabase", input.userId, metadata);
      await safeIncident(deps, {
        telegram_user_id: input.userId,
        vip_group_id: input.vipGroupId,
        subscription_id: input.subscriptionId,
        severity: "error",
        code: `${input.action}_state_update_failed`,
        title: "Expulsión ejecutada pero estado no actualizado",
        description: "Telegram expulsó y desbloqueó, pero falló actualizar Supabase.",
        metadata
      });
      return { ok: false, status: "state_update_failed", uiError: "manual_expel_state_failed", message: "Telegram expulsó y desbloqueó, pero falló actualizar Supabase.", metadata };
    }

    await safeBotLog(deps, input.action, "Usuario expulsado y desbloqueado para reingreso futuro", { userId: input.userId, groupId: input.vipGroupId, level: "warning", metadata: successMetadata });
    await safeAuditLog(deps, input.action, "Usuario expulsado y desbloqueado para reingreso futuro", input.userId, successMetadata);
    return { ok: true, status: "succeeded", message: "Usuario expulsado y desbloqueado correctamente.", metadata: successMetadata };
  } catch (error) {
    const metadata = {
      ...kickMetadata(input, "unexpected_error", "unexpected_error"),
      error_message: errorMessage(error),
      error_name: error instanceof Error ? error.name : "UnknownError"
    };
    await safeBotLog(deps, `${input.action}_unexpected_error`, "Error controlado en expulsión", { userId: input.userId, groupId: input.vipGroupId, level: "error", metadata });
    await safeAuditLog(deps, `${input.action}_unexpected_error`, "Error controlado en expulsión", input.userId, metadata);
    return { ok: false, status: "unexpected_error", uiError: "manual_expel_unexpected", message: "Error controlado en expulsión.", metadata };
  }
}

export async function manualExpelUser(userId: string, deps: Deps = defaultDeps()): Promise<ManualExpelResult> {
  let user: Record<string, unknown> | null = null;
  let subscription: Record<string, unknown> | null = null;
  let group: Record<string, unknown> | null = null;

  try {
    const userResult = await deps.db.from("telegram_users").select("*").eq("id", userId).single();
    if (userResult.error || !userResult.data) {
      return { ok: false, status: "precondition_failed", uiError: "manual_expel_missing_user", message: "No se encontró el usuario." };
    }
    user = userResult.data;

    const subscriptionResult = await readManualSubscriptions(deps, userId);
    if (subscriptionResult.error) throw subscriptionResult.error;
    const selected = selectManualSubscription(subscriptionResult.subscriptions, deps.now());
    if (selected.ambiguous) {
      return { ok: false, status: "precondition_failed", uiError: "manual_expel_ambiguous_subscription", message: "El usuario tiene suscripciones activas en varios grupos. Usa una acción explícita por grupo o suscripción." };
    }
    if (!selected.subscription) {
      return { ok: false, status: "precondition_failed", uiError: "manual_expel_missing_subscription", message: "El usuario no tiene suscripción actual." };
    }
    subscription = selected.subscription as ManualSubscription;

    const groupResult = await deps.db.from("vip_groups").select("*").eq("id", subscription!.vip_group_id).eq("is_active", true).single();
    if (groupResult.error || !groupResult.data) {
      return { ok: false, status: "precondition_failed", uiError: "manual_expel_missing_group", message: "No hay grupo activo configurado para esta suscripción." };
    }
    group = groupResult.data;
    const telegramUserId = user!.telegram_user_id as string | number;
    const vipGroupId = group!.id as string;
    const chatId = group!.telegram_chat_id as string | number;
    const subscriptionId = subscription!.id as string;
    const expulsionAttempts = Number(subscription!.expulsion_attempts ?? 0);
    return safeKickAndUnbanUser({
      action: "manual_expel",
      userId,
      telegramUserId,
      vipGroupId,
      chatId,
      subscriptionId,
      expulsionAttempts,
      successSubscriptionStatus: "expired"
    }, deps);
  } catch (error) {
    const metadata = {
      ...baseMetadata({
        telegramUserId: user?.telegram_user_id as string | number | undefined,
        vipGroupId: group?.id as string | undefined,
        chatId: group?.telegram_chat_id as string | number | undefined,
        subscriptionId: subscription?.id as string | undefined,
        currentStep: "unexpected_error",
        finalStatus: "unexpected_error"
      }),
      error_message: errorMessage(error),
      error_name: error instanceof Error ? error.name : "UnknownError"
    };
    await safeBotLog(deps, "manual_expel_unexpected_error", "Error controlado en expulsión manual", { userId, groupId: group?.id as string | undefined, level: "error", metadata });
    await safeAuditLog(deps, "manual_expel_unexpected_error", "Error controlado en expulsión manual", userId, metadata);
    return { ok: false, status: "unexpected_error", uiError: "manual_expel_unexpected", message: "Error controlado en expulsión manual.", metadata };
  }
}

export async function manualUnbanUser(userId: string, deps: Deps = defaultDeps()): Promise<ManualExpelResult> {
  try {
    const userResult = await deps.db.from("telegram_users").select("*").eq("id", userId).single();
    if (userResult.error || !userResult.data) return { ok: false, status: "precondition_failed", uiError: "manual_unban_missing_user", message: "No se encontró el usuario." };
    const user = userResult.data;
    const subscriptionResult = await readManualSubscriptions(deps, userId);
    if (subscriptionResult.error) throw subscriptionResult.error;
    const selected = selectManualSubscription(subscriptionResult.subscriptions, deps.now());
    if (selected.ambiguous) return { ok: false, status: "precondition_failed", uiError: "manual_unban_ambiguous_subscription", message: "El usuario tiene suscripciones activas en varios grupos. Usa una acción explícita por grupo o suscripción." };
    const subscription = selected.subscription;
    const groupId = subscription?.vip_group_id;
    if (!groupId) return { ok: false, status: "precondition_failed", uiError: "manual_unban_missing_subscription_group", message: "No se puede desbloquear: la suscripción no tiene grupo asociado." };
    const groupResult = await deps.db.from("vip_groups").select("*").eq("id", groupId).eq("is_active", true).single();
    if (groupResult.error || !groupResult.data) return { ok: false, status: "precondition_failed", uiError: "manual_unban_missing_group", message: "No hay grupo activo configurado." };
    const group = groupResult.data;

    try {
      await deps.unban(group.telegram_chat_id as string | number, user.telegram_user_id as string | number);
    } catch (error) {
      const metadata = {
        ...baseMetadata({
          telegramUserId: user.telegram_user_id as string | number,
          vipGroupId: group.id as string,
          chatId: group.telegram_chat_id as string | number,
          subscriptionId: subscription?.id as string | undefined,
          currentStep: "manual_unban",
          finalStatus: "unban_failed"
        }),
        ...telegramErrorMetadata(error, {
          method: "unbanChatMember",
          chat_id: group.telegram_chat_id as string | number,
          telegram_user_id: user.telegram_user_id as string | number,
          subscription_id: subscription?.id as string | undefined
        })
      };
      await safeBotLog(deps, "telegram_error", "Telegram rechazó el desbloqueo manual", { userId, groupId: group.id as string, level: "error", metadata });
      await safeAuditLog(deps, "manual_unban_failed", "Telegram rechazó el desbloqueo manual", userId, metadata);
      return { ok: false, status: "unban_failed", uiError: "manual_unban_failed", message: "Telegram rechazó el desbloqueo manual.", metadata };
    }

    const now = deps.now().toISOString();
    if (subscription?.id) {
      try {
        await updateSubscription(deps, subscription.id as string, {
          expulsion_status: "resolved_manual",
          last_expulsion_error: null,
          unbanned_after_kick_at: now
        });
      } catch (error) {
        console.error("manual_unban_subscription_update_failed", error);
      }
    }
    try {
      await updateUser(deps, userId, { operational_status: "resolved_manual" });
    } catch (error) {
      console.error("manual_unban_user_update_failed", error);
    }
    const metadata = baseMetadata({
      telegramUserId: user.telegram_user_id as string | number,
      vipGroupId: group.id as string,
      chatId: group.telegram_chat_id as string | number,
      subscriptionId: subscription?.id as string | undefined,
      currentStep: "manual_unban",
      finalStatus: "resolved_manual"
    });
    await safeBotLog(deps, "user_manually_unbanned", "Usuario desbloqueado manualmente por la admin", { userId, groupId: group.id as string, metadata });
    await safeAuditLog(deps, "manual_unban", "Usuario desbloqueado manualmente", userId, metadata);
    return { ok: true, status: "succeeded", message: "Usuario desbloqueado correctamente.", metadata };
  } catch (error) {
    const metadata = { action: "manual_unban", current_step: "unexpected_error", error_message: errorMessage(error), error_name: error instanceof Error ? error.name : "UnknownError" };
    await safeBotLog(deps, "manual_unban_unexpected_error", "Error controlado desbloqueando usuario", { userId, level: "error", metadata });
    await safeAuditLog(deps, "manual_unban_unexpected_error", "Error controlado desbloqueando usuario", userId, metadata);
    return { ok: false, status: "unexpected_error", uiError: "manual_unban_unexpected", message: "Error controlado desbloqueando usuario.", metadata };
  }
}
