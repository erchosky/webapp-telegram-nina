import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  testTelegramGroup: vi.fn(),
  from: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("./api", () => ({ testTelegramGroup: mocks.testTelegramGroup }));

import { runBotHealthCheck } from "./health";

describe("runBotHealthCheck", () => {
  it("guarda resultado ok en bot_health_checks y system_jobs", async () => {
    const inserts: Array<{ table: string; payload: unknown }> = [];
    const upserts: Array<{ table: string; payload: unknown }> = [];
    mocks.testTelegramGroup.mockResolvedValue({ ok: true, groupFound: true, chatTitle: "VIP", botInside: true, botAdmin: true, canCreateInvite: true, canRestrictMembers: true });
    mocks.from.mockImplementation((table: string) => ({
      insert: (payload: unknown) => { inserts.push({ table, payload }); return Promise.resolve({ error: null }); },
      upsert: (payload: unknown) => { upserts.push({ table, payload }); return Promise.resolve({ error: null }); }
    }));

    const result = await runBotHealthCheck(-100123, "group-1");

    expect(result.ok).toBe(true);
    expect(inserts.some((item) => item.table === "bot_health_checks" && (item.payload as Record<string, unknown>).ok === true)).toBe(true);
    expect(upserts.some((item) => item.table === "system_jobs")).toBe(true);
  });

  it("si falla crea incidencia crítica", async () => {
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    mocks.testTelegramGroup.mockResolvedValue({ ok: false, groupFound: false, chatTitle: null, botInside: false, botAdmin: false, canCreateInvite: false, canRestrictMembers: false, errorMessage: "chat not found" });
    mocks.from.mockImplementation((table: string) => ({
      insert: (payload: Record<string, unknown>) => { inserts.push({ table, payload }); return Promise.resolve({ error: null }); },
      upsert: () => Promise.resolve({ error: null })
    }));

    const result = await runBotHealthCheck(-100123, "group-1");

    expect(result.ok).toBe(false);
    expect(inserts.some((item) => item.table === "operational_incidents" && item.payload.severity === "critical")).toBe(true);
  });
});
