import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  selectExisting: vi.fn(),
  insertUser: vi.fn(),
  updateUser: vi.fn(),
  botLog: vi.fn(),
  getCurrentSubscription: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  telegramEnv: () => ({ TELEGRAM_BOT_TOKEN: "123456789:telegram-bot-secret-value" })
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/logs", () => ({ botLog: mocks.botLog }));
vi.mock("@/lib/subscriptions", () => ({ getCurrentSubscription: mocks.getCurrentSubscription }));
vi.mock("@/lib/telegram/message-settings", () => ({ getTelegramMessageContext: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/user-access", () => ({
  userAccessMessage: () => "Ya estás registrado en mi sistema VIP. Tu acceso queda pendiente de validación. Cuando valide tu pago, recibirás aquí tu enlace privado."
}));

import { createTelegramBot, getTelegramBot, subscriptionAllowsGroupJoin, upsertUser } from "./bot";

async function initializedBotWithSendMessageSpy() {
  const uninitializedBot = createTelegramBot();
  const sendMessage = vi.fn();
  uninitializedBot.api.config.use(async (_previous, method, payload) => {
    if (method === "getMe") {
      return { ok: true, result: { id: 999, is_bot: true, first_name: "la administradora", username: "TestingdelostestingBot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } } as never;
    }
    if (method === "sendMessage") sendMessage(payload);
    return { ok: true, result: { message_id: 2, date: 1, chat: { id: 123, type: "private" }, text: "ok" } } as never;
  });

  return { bot: await getTelegramBot(() => uninitializedBot), sendMessage };
}

describe("comando /start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: unknown }).__vipGuardTelegramBotPromise;
    mocks.selectExisting.mockResolvedValue({ data: null, error: null });
    mocks.insertUser.mockImplementation((payload: Record<string, unknown>) => ({
      select: () => ({ single: async () => ({ data: { id: "user-uuid", ...payload }, error: null }) })
    }));
    mocks.updateUser.mockImplementation((payload: Record<string, unknown>) => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: "user-uuid", telegram_user_id: 123, started_bot_at: "2026-06-01T10:00:00.000Z", first_seen_at: "2026-06-01T10:00:00.000Z", ...payload }, error: null }) }) })
    }));
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mocks.selectExisting }) }),
      insert: mocks.insertUser,
      update: mocks.updateUser
    });
    mocks.botLog.mockResolvedValue(undefined);
    mocks.getCurrentSubscription.mockResolvedValue(null);
  });

  it("crea el usuario y responde sin TELEGRAM_GROUP_CHAT_ID", async () => {
    const uninitializedBot = createTelegramBot();
    const getMe = vi.fn();
    const sendMessage = vi.fn();
    uninitializedBot.api.config.use(async (_previous, method, payload) => {
      if (method === "getMe") {
        getMe();
        return { ok: true, result: { id: 999, is_bot: true, first_name: "la administradora", username: "vip_guard_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } } as never;
      }
      if (method === "sendMessage") sendMessage(payload);
      return { ok: true, result: { message_id: 2, date: 1, chat: { id: 123, type: "private" }, text: "ok" } } as never;
    });
    const bot = await getTelegramBot(() => uninitializedBot);
    expect(await getTelegramBot()).toBe(bot);
    expect(getMe).toHaveBeenCalledTimes(1);

    await bot.handleUpdate({
      update_id: 42,
      message: {
        message_id: 1,
        date: 1,
        text: "/start",
        entities: [{ offset: 0, length: 6, type: "bot_command" }],
        from: { id: 123, is_bot: false, first_name: "Ada", last_name: "Lovelace", username: "ada" },
        chat: { id: 123, type: "private", first_name: "Ada", username: "ada" }
      }
    });

    expect(mocks.insertUser).toHaveBeenCalledWith(expect.objectContaining({
      telegram_user_id: 123,
      telegram_username: "ada",
      first_name: "Ada",
      last_name: "Lovelace",
      language_code: null,
      started_bot_at: expect.any(String),
      first_seen_at: expect.any(String),
      last_seen_at: expect.any(String)
    }));
    expect(mocks.getCurrentSubscription).toHaveBeenCalledWith("user-uuid");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ chat_id: 123, text: "Ya estás registrado en mi sistema VIP. Tu acceso queda pendiente de validación. Cuando valide tu pago, recibirás aquí tu enlace privado." }));
    expect(mocks.botLog).toHaveBeenCalledWith("start", "Usuario inició el bot", { userId: "user-uuid" });
  });

  it("/start es idempotente y queda limitado si un usuario lo repite 100 veces", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();
    const telegramUserId = 555000001;

    for (let i = 0; i < 100; i++) {
      await bot.handleUpdate({
        update_id: 10_000 + i,
        message: {
          message_id: 1 + i,
          date: 1,
          text: "/start",
          entities: [{ offset: 0, length: 6, type: "bot_command" }],
          from: { id: telegramUserId, is_bot: false, first_name: "Ada" },
          chat: { id: telegramUserId, type: "private", first_name: "Ada" }
        }
      });
    }

    expect(mocks.insertUser).toHaveBeenCalledTimes(30);
    expect(sendMessage).toHaveBeenCalledTimes(60);
  });

  it("registra usuarios sin username usando solo from.id como identidad estable", async () => {
    const { bot } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 46,
      message: {
        message_id: 1,
        date: 1,
        text: "/start",
        entities: [{ offset: 0, length: 6, type: "bot_command" }],
        from: { id: 555000002, is_bot: false, first_name: "SinUsername" },
        chat: { id: 555000002, type: "private", first_name: "SinUsername" }
      }
    });

    expect(mocks.insertUser).toHaveBeenCalledWith(expect.objectContaining({
      telegram_user_id: 555000002,
      telegram_username: null,
      first_name: "SinUsername"
    }));
  });

  it("primer /start rellena started_bot_at y el segundo lo conserva mientras actualiza last_seen_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
    const inserted: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    mocks.selectExisting.mockResolvedValueOnce({ data: null, error: null });
    mocks.insertUser.mockImplementationOnce((payload: Record<string, unknown>) => {
      inserted.push(payload);
      return { select: () => ({ single: async () => ({ data: { id: "user-uuid", ...payload }, error: null }) }) };
    });

    await upsertUser({ id: 123, is_bot: false, first_name: "Ada", username: "ada" });

    vi.setSystemTime(new Date("2026-06-02T10:00:00.000Z"));
    mocks.selectExisting.mockResolvedValueOnce({
      data: {
        id: "user-uuid",
        telegram_user_id: 123,
        first_seen_at: "2026-06-01T10:00:00.000Z",
        started_bot_at: "2026-06-01T10:00:00.000Z"
      },
      error: null
    });
    mocks.updateUser.mockImplementationOnce((payload: Record<string, unknown>) => {
      updated.push(payload);
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: {
                id: "user-uuid",
                telegram_user_id: 123,
                first_seen_at: "2026-06-01T10:00:00.000Z",
                started_bot_at: "2026-06-01T10:00:00.000Z",
                ...payload
              },
              error: null
            })
          })
        })
      };
    });

    const second = await upsertUser({ id: 123, is_bot: false, first_name: "Ada", username: "ada2" });

    expect(inserted[0]).toMatchObject({
      first_seen_at: "2026-06-01T10:00:00.000Z",
      started_bot_at: "2026-06-01T10:00:00.000Z",
      last_seen_at: "2026-06-01T10:00:00.000Z"
    });
    expect(updated[0]).toMatchObject({
      telegram_username: "ada2",
      last_seen_at: "2026-06-02T10:00:00.000Z"
    });
    expect(updated[0]).not.toHaveProperty("started_bot_at");
    expect(updated[0]).not.toHaveProperty("first_seen_at");
    expect(second.started_bot_at).toBe("2026-06-01T10:00:00.000Z");
    expect(second.last_seen_at).toBe("2026-06-02T10:00:00.000Z");
    vi.useRealTimers();
  });

  it("si el usuario bloqueó el bot, registra el fallo de respuesta y no rompe el webhook", async () => {
    const uninitializedBot = createTelegramBot();
    uninitializedBot.api.config.use(async (_previous, method) => {
      if (method === "getMe") {
        return { ok: true, result: { id: 999, is_bot: true, first_name: "la administradora", username: "vip_guard_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } } as never;
      }
      if (method === "sendMessage") throw new Error("Forbidden: bot was blocked by the user");
      return { ok: true, result: true } as never;
    });
    const bot = await getTelegramBot(() => uninitializedBot);

    await expect(bot.handleUpdate({
      update_id: 47,
      message: {
        message_id: 1,
        date: 1,
        text: "/start",
        entities: [{ offset: 0, length: 6, type: "bot_command" }],
        from: { id: 555000003, is_bot: false, first_name: "Ada" },
        chat: { id: 555000003, type: "private", first_name: "Ada" }
      }
    })).resolves.toBeUndefined();
    expect(mocks.botLog).toHaveBeenCalledWith("telegram_reply_failed", "Telegram rechazó una respuesta del bot", expect.objectContaining({
      level: "warning",
      metadata: expect.objectContaining({
        telegram_user_id: 555000003,
        error_message: "Forbidden: bot was blocked by the user"
      })
    }));
  });
});

describe("comando /id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: unknown }).__vipGuardTelegramBotPromise;
    mocks.botLog.mockResolvedValue(undefined);
  });

  it("responde con Telegram ID y chat ID actual en privado", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 43,
      message: {
        message_id: 1,
        date: 1,
        text: "/id",
        entities: [{ offset: 0, length: 3, type: "bot_command" }],
        from: { id: 978543967, is_bot: false, first_name: "Ada", username: "ada" },
        chat: { id: 978543967, type: "private", first_name: "Ada", username: "ada" }
      }
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: 978543967,
      text: "Tu Telegram ID es: 978543967\nChat ID actual: 978543967\nTipo de chat: private"
    }));
    expect(mocks.botLog).toHaveBeenCalledWith("id", "Usuario solicitó IDs de Telegram", { metadata: {
      telegram_user_id: 978543967,
      telegram_username: "ada",
      chat_id: 978543967,
      chat_type: "private",
      chat_title: null,
      message_text: "/id"
    } });
  });

  it("responde con Telegram ID, chat ID y nombre del grupo en supergrupo", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 44,
      message: {
        message_id: 1,
        date: 1,
        text: "/id@TestingdelostestingBot",
        entities: [{ offset: 0, length: 26, type: "bot_command" }],
        from: { id: 978543967, is_bot: false, first_name: "Ada", username: "ada" },
        chat: { id: -1001234567890, type: "supergroup", title: "Grupo Test" }
      }
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: -1001234567890,
      text: "Tu Telegram ID es: 978543967\nChat ID del grupo: -1001234567890\nTipo de chat: supergroup\nNombre del grupo: Grupo Test"
    }));
    expect(mocks.botLog).toHaveBeenCalledWith("id", "Usuario solicitó IDs de Telegram", { metadata: {
      telegram_user_id: 978543967,
      telegram_username: "ada",
      chat_id: -1001234567890,
      chat_type: "supergroup",
      chat_title: "Grupo Test",
      message_text: "/id@TestingdelostestingBot"
    } });
  });
});

describe("comando /estado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: unknown }).__vipGuardTelegramBotPromise;
  });

  it("no muestra el estado de suscripción en grupos", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 45,
      message: {
        message_id: 1,
        date: 1,
        text: "/estado@TestingdelostestingBot",
        entities: [{ offset: 0, length: 30, type: "bot_command" }],
        from: { id: 978543967, is_bot: false, first_name: "Ada", username: "ada" },
        chat: { id: -1001234567890, type: "supergroup", title: "Grupo Test" }
      }
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: -1001234567890,
      text: "Por privacidad, consulta tu estado por privado con el bot."
    }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getCurrentSubscription).not.toHaveBeenCalled();
  });
});

describe("entradas al grupo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: unknown }).__vipGuardTelegramBotPromise;
    mocks.botLog.mockResolvedValue(undefined);
  });

  it("no concede acceso usando una suscripción activa de otro grupo", () => {
    const subscription = {
      vip_group_id: "group-owned",
      status: "active",
      ends_at: "2099-01-01T00:00:00.000Z",
    };

    expect(subscriptionAllowsGroupJoin(subscription, "group-owned")).toBe(true);
    expect(subscriptionAllowsGroupJoin(subscription, "group-attacker-selected")).toBe(false);
  });

  it("marca activo en grupo sin invite_link cuando la suscripción activa sigue vigente", async () => {
    const updates: Array<{ table: string; payload: unknown; column: string; value: unknown }> = [];
    const inserts: Array<{ table: string; payload: unknown }> = [];
    mocks.getCurrentSubscription.mockResolvedValue({
      id: "sub-1",
      telegram_user_id: "user-uuid",
      vip_group_id: "group-1",
      status: "active",
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "vip_groups") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "group-1", telegram_chat_id: -1001234567890, is_active: true }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "telegram_users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return { select: () => ({ single: async () => ({ data: { id: "user-uuid", ...(payload as Record<string, unknown>) }, error: null }) }) };
          },
          update: (payload: unknown) => ({
            eq: (column: string, value: unknown) => {
              updates.push({ table, payload, column, value });
              return { select: () => ({ single: async () => ({ data: { id: "user-uuid", ...(payload as Record<string, unknown>) }, error: null }) }) };
            },
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          update: (payload: unknown) => ({
            eq: (column: string, value: unknown) => {
              updates.push({ table, payload, column, value });
              return { error: null };
            },
          }),
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return { error: null };
          },
        };
      }
      if (table === "invite_links" || table === "operational_incidents") {
        return {
          update: (payload: unknown) => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => {
                    updates.push({ table, payload, column: "used_at", value: null });
                    return { error: null };
                  },
                }),
              }),
            }),
          }),
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const uninitializedBot = createTelegramBot();
    uninitializedBot.api.config.use(async (_previous, method) => {
      if (method === "getMe") {
        return { ok: true, result: { id: 999, is_bot: true, first_name: "la administradora", username: "vip_guard_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } } as never;
      }
      return { ok: true, result: true } as never;
    });
    const bot = await getTelegramBot(() => uninitializedBot);

    await bot.handleUpdate({
      update_id: 50,
      chat_member: {
        chat: { id: -1001234567890, type: "supergroup", title: "Grupo Test" },
        from: { id: 999000, is_bot: false, first_name: "Admin" },
        date: 1,
        old_chat_member: { status: "left", user: { id: 555000006, is_bot: false, first_name: "Ada" } },
        new_chat_member: { status: "member", user: { id: 555000006, is_bot: false, first_name: "Ada", username: "ada" } },
      },
    });

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "telegram_users", payload: { operational_status: "active_in_group" }, column: "id", value: "user-uuid" }),
      expect.objectContaining({ table: "subscriptions", payload: { operational_status: "active_in_group" }, column: "id", value: "sub-1" }),
    ]));
    expect(inserts.some((item) => item.table === "subscriptions")).toBe(false);
    expect(inserts.some((item) => item.table === "operational_incidents")).toBe(false);
    expect(mocks.botLog).toHaveBeenCalledWith("group_member_active_detected", "Usuario activo detectado dentro del grupo", expect.objectContaining({
      userId: "user-uuid",
      groupId: "group-1",
    }));
  });
});

describe("mensajes desconocidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: unknown }).__vipGuardTelegramBotPromise;
  });

  it("responde de forma segura en privado y no toca Supabase", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 48,
      message: {
        message_id: 1,
        date: 1,
        text: "hola <script>alert(1)</script>",
        from: { id: 555000004, is_bot: false, first_name: "Ada" },
        chat: { id: 555000004, type: "private", first_name: "Ada" }
      }
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: 555000004,
      text: "No he entendido ese mensaje. Usa /start para registrarte o /estado para consultar tu acceso."
    }));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("ignora mensajes desconocidos en grupo", async () => {
    const { bot, sendMessage } = await initializedBotWithSendMessageSpy();

    await bot.handleUpdate({
      update_id: 49,
      message: {
        message_id: 1,
        date: 1,
        text: "spam",
        from: { id: 555000005, is_bot: false, first_name: "Ada" },
        chat: { id: -1001234567890, type: "supergroup", title: "Grupo Test" }
      }
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
