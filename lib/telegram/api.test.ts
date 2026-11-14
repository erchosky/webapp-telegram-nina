import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/env", () => ({ telegramEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456789:telegram-bot-secret-value" }) }));

import { createInviteLink, markInviteDeliveryError, markInviteSent, testTelegramGroup } from "./api";

describe("telegram api helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("valida grupo si el bot es admin con permisos de invitación y restricción", async () => {
    const telegramApi = {
      getChat: vi.fn().mockResolvedValue({ id: -1001234567890, type: "supergroup", title: "Grupo Test" }),
      getMe: vi.fn().mockResolvedValue({ id: 999, is_bot: true, first_name: "Bot" }),
      getChatMember: vi.fn().mockResolvedValue({ status: "administrator", can_invite_users: true, can_restrict_members: true })
    };

    const result = await testTelegramGroup(-1001234567890, telegramApi as never);

    expect(result).toMatchObject({
      ok: true,
      groupFound: true,
      chatTitle: "Grupo Test",
      botInside: true,
      botAdmin: true,
      canCreateInvite: true,
      canRestrictMembers: true
    });
  });

  it("marca inválido si el bot no puede crear enlaces o expulsar", async () => {
    const telegramApi = {
      getChat: vi.fn().mockResolvedValue({ id: -1001234567890, type: "supergroup", title: "Grupo Test" }),
      getMe: vi.fn().mockResolvedValue({ id: 999, is_bot: true, first_name: "Bot" }),
      getChatMember: vi.fn().mockResolvedValue({ status: "administrator", can_invite_users: false, can_restrict_members: false })
    };

    const result = await testTelegramGroup(-1001234567890, telegramApi as never);

    expect(result.ok).toBe(false);
    expect(result.botAdmin).toBe(true);
    expect(result.canCreateInvite).toBe(false);
    expect(result.canRestrictMembers).toBe(false);
  });

  it("markInviteSent no ignora errores de Supabase", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: async () => ({ error: new Error("Supabase update failed") })
        })
      })
    });

    await expect(markInviteSent("invite-1")).rejects.toThrow("Supabase update failed");
  });

  it("guarda error retry_pending del enlace sin crear otro enlace", async () => {
    const update = vi.fn().mockReturnValue({ eq: async () => ({ error: null }) });
    mocks.createAdminClient.mockReturnValue({
      from: () => ({ update })
    });

    await markInviteDeliveryError("invite-1", "rate_limited retry_after=23");

    expect(update).toHaveBeenCalledWith({ delivery_error: "rate_limited retry_after=23" });
  });

  it("crea enlaces personales con caducidad de 24 horas y límite de un uso", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    const inserted: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: () => {
        const existingQuery = {
          eq: () => existingQuery,
          is: () => existingQuery,
          gt: () => existingQuery,
          order: () => existingQuery,
          limit: () => existingQuery,
          maybeSingle: async () => ({ data: null, error: null })
        };
        return {
          select: () => existingQuery,
          insert: (payload: unknown) => {
            inserted.push(payload);
            return { select: () => ({ single: async () => ({ data: { id: "invite-1", ...(payload as object) }, error: null }) }) };
          }
        };
      }
    });
    const telegramApi = {
      createChatInviteLink: vi.fn().mockResolvedValue({ invite_link: "https://t.me/+personal" })
    };

    const result = await createInviteLink("user-abcdef123456", { id: "group-1", telegram_chat_id: -1001234567890 }, telegramApi as never);

    expect(telegramApi.createChatInviteLink).toHaveBeenCalledWith(-1001234567890, {
      member_limit: 1,
      expire_date: Math.floor(new Date("2026-06-25T10:00:00Z").getTime() / 1000),
      name: "VIP Access"
    });
    expect(inserted[0]).toMatchObject({
      telegram_user_id: "user-abcdef123456",
      vip_group_id: "group-1",
      invite_link: "https://t.me/+personal",
      expire_at: "2026-06-25T10:00:00.000Z",
      member_limit: 1
    });
    expect(result.id).toBe("invite-1");
  });

  it("guarda subscription_id y no reutiliza enlaces usados", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    const isFilters: Array<[string, unknown]> = [];
    const eqFilters: Array<[string, unknown]> = [];
    const inserted: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: () => {
        const existingQuery = {
          eq: (column: string, value: unknown) => { eqFilters.push([column, value]); return existingQuery; },
          is: (column: string, value: unknown) => { isFilters.push([column, value]); return existingQuery; },
          gt: () => existingQuery,
          order: () => existingQuery,
          limit: () => existingQuery,
          maybeSingle: async () => ({ data: null, error: null })
        };
        return {
          select: () => existingQuery,
          insert: (payload: unknown) => {
            inserted.push(payload);
            return { select: () => ({ single: async () => ({ data: { id: "invite-1", ...(payload as object) }, error: null }) }) };
          }
        };
      }
    });
    const telegramApi = {
      createChatInviteLink: vi.fn().mockResolvedValue({ invite_link: "https://t.me/+scoped" })
    };

    await createInviteLink("user-abcdef123456", { id: "group-1", telegram_chat_id: -1001234567890 }, telegramApi as never, null, "sub-1");

    expect(isFilters).toContainEqual(["used_at", null]);
    expect(eqFilters).toContainEqual(["subscription_id", "sub-1"]);
    expect(inserted[0]).toMatchObject({ subscription_id: "sub-1" });
  });

  it("reutiliza un enlace vigente para no generar invitaciones duplicadas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    const existingInvite = { id: "invite-existing", invite_link: "https://t.me/+old", expire_at: "2026-06-24T20:00:00.000Z" };
    const insert = vi.fn();
    mocks.createAdminClient.mockReturnValue({
      from: () => {
        const existingQuery = {
          eq: () => existingQuery,
          is: () => existingQuery,
          gt: () => existingQuery,
          order: () => existingQuery,
          limit: () => existingQuery,
          maybeSingle: async () => ({ data: existingInvite, error: null })
        };
        return {
          select: () => existingQuery,
          insert
        };
      }
    });
    const telegramApi = {
      createChatInviteLink: vi.fn()
    };

    const result = await createInviteLink("user-abcdef123456", { id: "group-1", telegram_chat_id: -1001234567890 }, telegramApi as never);

    expect(result).toMatchObject({ id: "invite-existing", reused: true });
    expect(telegramApi.createChatInviteLink).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("no crea enlaces que caduquen después de la suscripción", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T10:00:00Z"));
    const inserted: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: () => {
        const existingQuery = {
          eq: () => existingQuery,
          is: () => existingQuery,
          gt: () => existingQuery,
          order: () => existingQuery,
          limit: () => existingQuery,
          maybeSingle: async () => ({ data: null, error: null })
        };
        return {
          select: () => existingQuery,
          insert: (payload: unknown) => {
            inserted.push(payload);
            return { select: () => ({ single: async () => ({ data: { id: "invite-1", ...(payload as object) }, error: null }) }) };
          }
        };
      }
    });
    const telegramApi = {
      createChatInviteLink: vi.fn().mockResolvedValue({ invite_link: "https://t.me/+short" })
    };

    await createInviteLink("user-abcdef123456", { id: "group-1", telegram_chat_id: -1001234567890 }, telegramApi as never, "2026-06-24T12:00:00Z");

    expect(telegramApi.createChatInviteLink).toHaveBeenCalledWith(-1001234567890, expect.objectContaining({
      expire_date: Math.floor(new Date("2026-06-24T12:00:00Z").getTime() / 1000)
    }));
    expect(inserted[0]).toMatchObject({ expire_at: "2026-06-24T12:00:00.000Z" });
  });
});
