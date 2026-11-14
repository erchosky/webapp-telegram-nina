import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const adminUserStatusValues = ["all", "active", "pending_validation", "expired", "cancelled"] as const;
export type AdminUserStatusFilter = typeof adminUserStatusValues[number];

export type AdminUserListRow = {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  first_seen_at: string;
  started_bot_at: string | null;
  last_seen_at: string | null;
  first_subscription_at: string | null;
  operational_status: string | null;
  internal_notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  subscription: Record<string, unknown> | null;
  access_status: string;
  total_count: number;
};

type AdminDb = ReturnType<typeof createAdminClient>;

export function normalizeAdminUserStatus(value: unknown): AdminUserStatusFilter {
  return typeof value === "string" && (adminUserStatusValues as readonly string[]).includes(value)
    ? value as AdminUserStatusFilter
    : "all";
}

export function sanitizeAdminUserSearch(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[%,]/g, " ").trim() : "";
}

export async function listAdminUsers(
  input: { status?: unknown; search?: unknown; page?: number; pageSize?: number; now?: Date },
  db: AdminDb = createAdminClient()
) {
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 50, 100));
  const page = Math.max(1, input.page ?? 1);
  const status = normalizeAdminUserStatus(input.status);
  const search = sanitizeAdminUserSearch(input.search);
  const offset = (page - 1) * pageSize;
  const { data, error } = await db.rpc("admin_list_users", {
    p_status: status,
    p_search: search || null,
    p_limit: pageSize,
    p_offset: offset,
    p_now: (input.now ?? new Date()).toISOString()
  });
  if (error) throw error;
  const rows = (data ?? []) as AdminUserListRow[];
  return {
    rows,
    count: rows[0]?.total_count ?? 0,
    page,
    pageSize,
    selected: status,
    search
  };
}
