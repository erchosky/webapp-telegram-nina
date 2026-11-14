import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAdmin: vi.fn(), listAdminInterests: vi.fn(), auditLog: vi.fn() }));
vi.mock("@/lib/auth/admin-session", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/admin/webappData", () => ({ listAdminInterests: mocks.listAdminInterests }));
vi.mock("@/lib/logs", () => ({ auditLog: mocks.auditLog }));

import { GET } from "./route";

describe("interest CSV export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechaza una sesión no administrativa", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await GET(new Request("https://app.example/api/admin/webapp/interests/export"))).status).toBe(401);
  });

  it("exporta filtros, evita fórmulas CSV y marca no-store", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.listAdminInterests.mockResolvedValue({ error: null, count: 1, data: [{
      created_at: "2026-07-11T10:00:00Z", status: "requested", user_name: "=FORMULA", telegram_username: "fixture", telegram_user_numeric_id: 123,
      message: "Mensaje", internal_notes: "Nota", marketplace_items: { title: "Producto" }, marketplace_categories: { title: "Categoría" },
    }] });
    const response = await GET(new Request("https://app.example/api/admin/webapp/interests/export?status=requested&q=fixture"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("'=FORMULA");
    expect(mocks.listAdminInterests).toHaveBeenCalledWith(expect.objectContaining({ status: "requested", q: "fixture", pageSize: 5_000 }));
  });
});
