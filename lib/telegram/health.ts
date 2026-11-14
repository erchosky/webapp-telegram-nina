import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { testTelegramGroup, type TelegramGroupTestResult } from "./api";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type BotHealthCheck = TelegramGroupTestResult & {
  vipGroupId?: string | null;
  chatId?: string | number | null;
  checkedAt: string;
};

export async function saveBotHealthCheck(result: BotHealthCheck) {
  const db = createAdminClient();
  const payload = {
    vip_group_id: result.vipGroupId ?? null,
    ok: result.ok,
    chat_id: result.chatId ?? null,
    chat_title: result.chatTitle ?? null,
    bot_inside: result.botInside,
    bot_admin: result.botAdmin,
    can_create_invite: result.canCreateInvite,
    can_restrict_members: result.canRestrictMembers,
    can_read_events: result.botInside,
    error_message: result.errorMessage ?? null,
    metadata: {
      group_found: result.groupFound,
      checked_at: result.checkedAt
    }
  };
  const { error } = await db.from("bot_health_checks").insert(payload);
  if (error) throw error;

  await db.from("system_jobs").upsert({
    job_name: "bot-health-check",
    last_started_at: result.checkedAt,
    last_finished_at: result.checkedAt,
    last_success_at: result.ok ? result.checkedAt : null,
    last_error_at: result.ok ? null : result.checkedAt,
    last_error_message: result.errorMessage ?? (result.ok ? null : "Bot/group health check failed"),
    last_result_summary: payload
  });

  if (!result.ok) {
    await db.from("operational_incidents").insert({
      vip_group_id: result.vipGroupId ?? null,
      severity: "critical",
      status: "open",
      code: "bot_group_health_failed",
      title: "El bot no puede operar el grupo VIP",
      description: "El bot fue eliminado, perdió permisos o el grupo configurado no es accesible.",
      metadata: payload
    });
  }
}

export async function runBotHealthCheck(chatId: string | number, vipGroupId?: string | null): Promise<BotHealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await testTelegramGroup(chatId);
    const fullResult = { ...result, vipGroupId, chatId, checkedAt };
    await saveBotHealthCheck(fullResult);
    return fullResult;
  } catch (error) {
    const fullResult: BotHealthCheck = {
      ok: false,
      groupFound: false,
      chatTitle: null,
      botInside: false,
      botAdmin: false,
      canCreateInvite: false,
      canRestrictMembers: false,
      errorMessage: errorText(error),
      vipGroupId,
      chatId,
      checkedAt
    };
    try {
      await saveBotHealthCheck(fullResult);
    } catch (saveError) {
      console.error("bot_health_check_save_failed", saveError);
    }
    return fullResult;
  }
}
