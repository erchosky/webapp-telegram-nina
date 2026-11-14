import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { profileMessage } from "./profile";

describe("profileMessage", () => {
  afterEach(() => vi.useRealTimers());

  it("renderiza tarjeta premium activa", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    mocks.from.mockImplementation((table: string) => {
      if (table === "subscriptions") return {
        select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "sub-1", status: "active", starts_at: "2026-06-01T10:00:00.000Z", ends_at: "2026-07-01T10:00:00.000Z" }], error: null }) }) })
      };
      if (table === "manual_payments") return {
        select: () => ({ eq: async () => ({ data: [{ id: "pay-1" }], error: null }) })
      };
      if (table === "telegram_users") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_streak_months: 3 }, error: null }) }) })
      };
      throw new Error(`Tabla inesperada: ${table}`);
    });

    const text = await profileMessage("user-1", "es", { nombreGrupo: "Grupo VIP", contactoAdmin: "@la administradora" });

    expect(text).toContain("👤 Tu perfil VIP");
    expect(text).toContain("Estado: Activo");
    expect(text).toContain("Grupo: Grupo VIP");
    expect(text).toContain("Contacto: @la administradora");
    expect(text).toContain("Racha actual: 3 mes(es)");
  });
});
