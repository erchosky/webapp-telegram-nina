import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ SESSION_SECRET: "x".repeat(64) })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.db
}));

import {
  createAdminToken,
  currentAdminSessionId,
  isAdmin,
  revokeAdminToken,
  revokeAllAdminSessions,
  revokeCurrentAdminSession,
  revokeOtherAdminSessions,
  verifyAdminToken,
} from "./admin-session";

describe("admin sessions revocables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.cookies.mockResolvedValue({ get: () => undefined });
  });

  it("login crea sesión en DB y el token firmado permite acceso", async () => {
    let sessionRow: Record<string, string | null> = {};
    mocks.db.mockReturnValue({
      from(table: string) {
        expect(table).toBe("admin_sessions");
        return {
          insert(payload: Record<string, string>) {
            sessionRow = { ...payload, revoked_at: null };
            return Promise.resolve({ error: null });
          },
          update: () => ({
            eq: async () => ({ error: null })
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sessionRow, error: null })
            })
          })
        };
      }
    });

    const token = await createAdminToken({ userAgent: "Vitest", ip: "127.0.0.1" });

    expect(sessionRow?.session_token_hash).toHaveLength(64);
    expect(sessionRow?.user_agent).toBe("Vitest");
    expect(await verifyAdminToken(token)).toBe(true);
  });

  it("sesión revocada no accede", async () => {
    let sessionRow: Record<string, string | null> = {};
    mocks.db.mockReturnValue({
      from: () => ({
        insert(payload: Record<string, string>) {
          sessionRow = { ...payload, revoked_at: "2026-06-24T10:00:00.000Z" };
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: sessionRow, error: null })
          })
        })
      })
    });

    const token = await createAdminToken();

    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("sesión expirada no accede", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T10:00:00.000Z"));
    let sessionRow: Record<string, string | null> = {};
    mocks.db.mockReturnValue({
      from: () => ({
        insert(payload: Record<string, string>) {
          sessionRow = { ...payload, expires_at: "2026-06-24T09:59:00.000Z", revoked_at: null };
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: sessionRow, error: null })
          })
        })
      })
    });

    const token = await createAdminToken();

    expect(await verifyAdminToken(token)).toBe(false);
    vi.useRealTimers();
  });

  it("cerrar sesión revoca la sesión actual", async () => {
    let sessionRow: Record<string, string | null> = {};
    const updates: Record<string, string>[] = [];
    mocks.db.mockReturnValue({
      from: () => ({
        insert(payload: Record<string, string>) {
          sessionRow = { ...payload, revoked_at: null };
          return Promise.resolve({ error: null });
        },
        update(payload: Record<string, string>) {
          updates.push(payload);
          return {
            eq: () => ({
              is: async () => ({ error: null })
            })
          };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: sessionRow, error: null })
          })
        })
      })
    });

    const token = await createAdminToken();

    expect(await revokeAdminToken(token)).toBe(true);
    expect(updates[0]).toHaveProperty("revoked_at");
  });

  it("cerrar todas revoca todas las sesiones no revocadas", async () => {
    const updates: Record<string, string>[] = [];
    mocks.db.mockReturnValue({
      from: () => ({
        update(payload: Record<string, string>) {
          updates.push(payload);
          return {
            is: async () => ({ error: null })
          };
        }
      })
    });

    await revokeAllAdminSessions();

    expect(updates[0]).toHaveProperty("revoked_at");
  });

  it("rechaza tokens manipulados y sesiones ausentes sin conceder acceso", async () => {
    mocks.db.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    });

    expect(await verifyAdminToken("not-a-token")).toBe(false);

    const token = await signedSessionToken();
    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("falla de forma cerrada ante un error de base de datos", async () => {
    const token = await signedSessionToken();
    mocks.db.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "db offline" } }) }) }),
      }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await verifyAdminToken(token)).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("deriva el id y el estado admin de la cookie firmada", async () => {
    let sessionRow: Record<string, string | null> = {};
    mocks.db.mockReturnValue({
      from: () => ({
        insert(payload: Record<string, string>) {
          sessionRow = { ...payload, revoked_at: null };
          return Promise.resolve({ error: null });
        },
        update: () => ({ eq: async () => ({ error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sessionRow, error: null }) }) }),
      }),
    });
    const token = await createAdminToken();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: token }) });

    expect(await currentAdminSessionId()).toBe(sessionRow.id);
    expect(await isAdmin()).toBe(true);
  });

  it("no intenta revocar cuando el token no es válido", async () => {
    expect(await revokeAdminToken("invalid")).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("revoca la sesión actual y las demás, preservando la sesión presente", async () => {
    let sessionRow: Record<string, string | null> = {};
    const updates: Array<{ payload: Record<string, string>; excludedId?: string }> = [];
    mocks.db.mockReturnValue({
      from: () => ({
        insert(payload: Record<string, string>) {
          sessionRow = { ...payload, revoked_at: null };
          return Promise.resolve({ error: null });
        },
        update(payload: Record<string, string>) {
          const update: { payload: Record<string, string>; excludedId?: string } = { payload };
          updates.push(update);
          const is = () => ({
            neq: async (_column: string, id: string) => {
              update.excludedId = id;
              return { error: null };
            },
          });
          return {
            eq: () => ({
              is: async () => ({ error: null }),
            }),
            is,
          };
        },
      }),
    });
    const token = await createAdminToken();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: token }) });

    expect(await revokeCurrentAdminSession()).toBe(true);
    await revokeOtherAdminSessions();
    expect(updates).toHaveLength(2);
    expect(updates[1].excludedId).toBe(sessionRow.id);
  });
});

async function signedSessionToken() {
  const db = {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  };
  mocks.db.mockReturnValueOnce(db);
  return createAdminToken();
}
