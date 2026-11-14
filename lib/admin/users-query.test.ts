import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { listAdminUsers } from "./users-query";

function dbReturning(rows: unknown[] = []) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  return { db: { rpc }, rpc };
}

describe("admin users query", () => {
  it("filtra activos en Supabase y pagina coherentemente aunque estén en página 2", async () => {
    const { db, rpc } = dbReturning([{ id: "user-51", access_status: "active", total_count: 51 }]);

    const result = await listAdminUsers({ status: "active", page: 2, pageSize: 50, now: new Date("2026-06-24T10:00:00Z") }, db as never);

    expect(rpc).toHaveBeenCalledWith("admin_list_users", expect.objectContaining({
      p_status: "active",
      p_limit: 50,
      p_offset: 50
    }));
    expect(result.rows[0]?.id).toBe("user-51");
    expect(result.count).toBe(51);
  });

  it("filtra pendientes en Supabase y pagina coherentemente aunque estén en página 2", async () => {
    const { db, rpc } = dbReturning([{ id: "pending-51", access_status: "pending_validation", total_count: 75 }]);

    await listAdminUsers({ status: "pending_validation", page: 2, pageSize: 50, now: new Date("2026-06-24T10:00:00Z") }, db as never);

    expect(rpc).toHaveBeenCalledWith("admin_list_users", expect.objectContaining({
      p_status: "pending_validation",
      p_offset: 50
    }));
  });

  it("combina búsqueda server-side con filtro de estado", async () => {
    const { db, rpc } = dbReturning([{ id: "ada", access_status: "active", total_count: 1 }]);

    await listAdminUsers({ status: "active", search: " @ada% ", page: 1, pageSize: 50, now: new Date("2026-06-24T10:00:00Z") }, db as never);

    expect(rpc).toHaveBeenCalledWith("admin_list_users", expect.objectContaining({
      p_status: "active",
      p_search: "@ada",
      p_limit: 50,
      p_offset: 0
    }));
  });
});
