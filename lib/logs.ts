import { createAdminClient } from "@/lib/supabase/admin";

export async function botLog(action: string, message: string, options: { userId?: string; groupId?: string; level?: "info"|"warning"|"error"; metadata?: unknown } = {}) {
  const { error } = await createAdminClient().from("bot_logs").insert({ action, message, level: options.level ?? "info", telegram_user_id: options.userId, vip_group_id: options.groupId, metadata: options.metadata });
  if (error) throw error;
}

export async function auditLog(action: string, message: string, userId?: string, metadata?: unknown) {
  const { error } = await createAdminClient().from("admin_audit_logs").insert({ action, message, target_user_id: userId, metadata, performed_by: "admin" });
  if (error) throw error;
}

export async function safeLog(operation: () => Promise<unknown>, label = "safe_log_failed") {
  try {
    await operation();
    return true;
  } catch (error) {
    console.error(label, error);
    return false;
  }
}

export function safeBotLog(...args: Parameters<typeof botLog>) {
  return safeLog(() => botLog(...args), "bot_log_failed");
}

export function safeAuditLog(...args: Parameters<typeof auditLog>) {
  return safeLog(() => auditLog(...args), "audit_log_failed");
}
