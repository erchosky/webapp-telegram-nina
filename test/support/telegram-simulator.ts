import crypto from "node:crypto";
import { gzipSync } from "node:zlib";

export const TEST_TELEGRAM_BOT_TOKEN =
  "123456789:fixture_bot_token_2026";

export const TEST_TELEGRAM_USERS = {
  member: {
    id: 700000001,
    first_name: "Ángela",
    username: "fixture_member",
    language_code: "es",
  },
  otherMember: {
    id: 700000002,
    first_name: "Bruno",
    username: "fixture_other",
    language_code: "pt",
  },
  noAccess: {
    id: 700000003,
    first_name: "No Access",
    username: "fixture_no_access",
    language_code: "en",
  },
} as const;

export type TelegramFixtureUser = {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
  is_bot?: boolean;
};

export type InitDataOptions = {
  token?: string;
  authDate?: number;
  user?: TelegramFixtureUser;
  omit?: "auth_date" | "user" | "query_id";
  extraFields?: ReadonlyArray<readonly [string, string]>;
  reverseOrder?: boolean;
};

/**
 * Cryptographically sign controlled Telegram Mini App fields using Telegram's
 * WebAppData HMAC procedure. The tuple form deliberately supports duplicate
 * keys so parser-confusion regressions can be exercised.
 */
export function signTelegramInitDataEntries(
  entries: ReadonlyArray<readonly [string, string]>,
  token = TEST_TELEGRAM_BOT_TOKEN,
): string {
  const dataCheckString = entries
    .filter(([key]) => key !== "hash" && key !== "signature")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(token)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const params = new URLSearchParams(entries.map(([key, value]) => [key, value]));
  params.append("hash", hash);
  return params.toString();
}

export function createTelegramInitData(options: InitDataOptions = {}): string {
  const now = options.authDate ?? Math.floor(Date.now() / 1000);
  const user = options.user ?? TEST_TELEGRAM_USERS.member;
  const entries: Array<[string, string]> = [
    ["auth_date", String(now)],
    ["query_id", `fixture-query-${user.id}`],
    ["user", JSON.stringify(user)],
    ...(options.extraFields?.map(([key, value]) => [key, value] as [string, string]) ?? []),
  ];
  if (options.omit) {
    const omittedIndex = entries.findIndex(([key]) => key === options.omit);
    if (omittedIndex >= 0) entries.splice(omittedIndex, 1);
  }
  if (options.reverseOrder) entries.reverse();
  return signTelegramInitDataEntries(entries, options.token);
}

export function tamperInitDataHash(initData: string): string {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  params.set("hash", `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`);
  return params.toString();
}

export function createDuplicateInitDataField(
  field: "auth_date" | "user" | "query_id" = "user",
): string {
  const now = Math.floor(Date.now() / 1000);
  const entries: Array<[string, string]> = [
    ["auth_date", String(now)],
    ["query_id", "fixture-duplicate"],
    ["user", JSON.stringify(TEST_TELEGRAM_USERS.member)],
  ];
  const original = entries.find(([key]) => key === field);
  if (!original) throw new Error(`Unsupported duplicate field: ${field}`);
  entries.push([...original]);
  return signTelegramInitDataEntries(entries);
}

export function createLargeInitData(size = 20 * 1024): string {
  return createTelegramInitData({ extraFields: [["payload", "x".repeat(size)]] });
}

export type TelegramUpdateFixture = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number; type: "private" | "supergroup"; title?: string };
    from: TelegramFixtureUser;
    text?: string;
    entities?: Array<{ offset: number; length: number; type: "bot_command" }>;
  };
  unknown_fixture_update?: { value: string };
};

export function createTelegramUpdate(input: {
  updateId?: number;
  user?: TelegramFixtureUser;
  text?: string;
  unknown?: boolean;
} = {}): TelegramUpdateFixture {
  const updateId = input.updateId ?? 910000001;
  const user = input.user ?? TEST_TELEGRAM_USERS.member;
  if (input.unknown) {
    return { update_id: updateId, unknown_fixture_update: { value: "ignored" } };
  }
  const text = input.text ?? "/start";
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: user.id, type: "private" },
      from: user,
      text,
      ...(text.startsWith("/")
        ? { entities: [{ offset: 0, length: text.split(/\s/, 1)[0].length, type: "bot_command" }] }
        : {}),
    },
  };
}

export function createOversizedWebhookBody(size = 300 * 1024): string {
  return JSON.stringify({
    ...createTelegramUpdate(),
    fixture_padding: "x".repeat(size),
  });
}

export function createCompressedOversizedWebhookBody(size = 300 * 1024): {
  body: Buffer;
  headers: Record<string, string>;
} {
  return {
    body: gzipSync(createOversizedWebhookBody(size)),
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
  };
}
