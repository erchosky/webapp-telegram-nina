import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function listRows(
  table: string,
  columns = "*",
  limit = 100,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { data: [], error: "Supabase no configurado" };
  }
  const { data, error } = await createAdminClient()
    .from(table)
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: ((data ?? []) as unknown) as Record<string, unknown>[], error: error?.message ?? null };
}

export async function listOrderedRows(
  table: string,
  columns = "*",
  limit = 100,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { data: [], error: "Supabase no configurado" };
  }
  const { data, error } = await createAdminClient()
    .from(table)
    .select(columns)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: ((data ?? []) as unknown) as Record<string, unknown>[], error: error?.message ?? null };
}

export type InterestAdminFilters = {
  status?: string;
  q?: string;
  categoryId?: string;
  itemId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

const interestColumns = "id, item_id, category_id, telegram_user_numeric_id, user_name, telegram_username, message, status, internal_notes, metadata, created_at, updated_at, marketplace_items(id, title, status), marketplace_categories(id, title, slug)";

export async function listAdminInterests(filters: InterestAdminFilters = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { data: [] as Record<string, unknown>[], error: "Supabase no configurado", count: 0 };
  }
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(5_000, Math.max(1, filters.pageSize ?? 25));
  let query = createAdminClient()
    .from("purchase_interests")
    .select(interestColumns, { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.itemId) query = query.eq("item_id", filters.itemId);
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) query = query.lt("created_at", `${filters.to}T23:59:59.999Z`);
  const q = filters.q?.trim().replace(/[%_,()]/g, " ").slice(0, 100);
  if (q) query = query.or(`user_name.ilike.%${q}%,telegram_username.ilike.%${q}%,message.ilike.%${q}%`);
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  return { data: ((data ?? []) as unknown) as Record<string, unknown>[], error: error?.message ?? null, count: count ?? 0 };
}
