import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { botLog } from "@/lib/logs";
import { getChatInfo } from "./api";

type AdminClient = ReturnType<typeof createAdminClient>;

function configuredGroupChatId() {
  const raw = process.env.TELEGRAM_GROUP_CHAT_ID?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed < 0 ? parsed : null;
}

function chatTitle(chat: Awaited<ReturnType<typeof getChatInfo>>) {
  return "title" in chat && chat.title ? chat.title : "VIP Group";
}

export async function getActiveVipGroup(db: AdminClient = createAdminClient()) {
  const { data, error } = await db.from("vip_groups").select("*").eq("is_active", true).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureDefaultVipGroup(db: AdminClient = createAdminClient()) {
  const existing = await getActiveVipGroup(db);
  if (existing) return existing;

  const telegramChatId = configuredGroupChatId();
  if (!telegramChatId) throw new Error("Configura un grupo VIP antes de validar usuarios.");

  let name = "VIP Group";
  try {
    name = chatTitle(await getChatInfo(telegramChatId));
  } catch (error) {
    await botLog("default_group_get_chat_failed", "No se pudo leer el nombre del grupo configurado; se crea con nombre genérico.", {
      level: "warning",
      metadata: {
        telegram_chat_id: telegramChatId,
        error_message: error instanceof Error ? error.message : String(error)
      }
    });
  }

  const payload = {
    telegram_chat_id: telegramChatId,
    name,
    public_name: name,
    is_active: true,
    automatic_expulsion_enabled: false,
    beta_mode: true,
    read_only_mode: false,
    admin_contact: null,
    payment_instructions: null,
    welcome_text: null,
    renewal_text: null,
    support_text: null
  };

  const { data, error } = await db.from("vip_groups").insert(payload).select("*").single();
  if (error) throw error;
  await botLog("default_group_created", "Grupo VIP activo creado automáticamente desde TELEGRAM_GROUP_CHAT_ID", {
    groupId: data.id,
    metadata: { telegram_chat_id: telegramChatId, name }
  });
  return data;
}
