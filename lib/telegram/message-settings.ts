import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TelegramMessageContext } from "./messages";

export async function getTelegramMessageContext(): Promise<TelegramMessageContext> {
  const { data, error } = await createAdminClient()
    .from("vip_groups")
    .select("name,public_name,admin_contact,payment_instructions,welcome_text,renewal_text,support_text")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return {};
  return {
    nombreGrupo: data.public_name ?? data.name ?? null,
    contactoAdmin: data.admin_contact ?? null,
    instruccionesPago: data.payment_instructions ?? null,
    bienvenida: data.welcome_text ?? null,
    renovacion: data.renewal_text ?? null,
    soporte: data.support_text ?? null
  };
}
