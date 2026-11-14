import "server-only";
import { telegramEnv } from "@/lib/env";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import {
  InitDataError,
  validateInitData,
  type TelegramWebAppUser,
} from "@/lib/telegram/initData";
import type { TelegramUserRow } from "@/lib/domain/types";

/**
 * Result of authenticating a Mini App request: the validated Telegram user, the
 * matching/created `telegram_users` row, and a ready service-role client.
 */
export interface AuthContext {
  supabase: AdminClient;
  /** Raw Telegram user from the validated initData. */
  tgUser: TelegramWebAppUser;
  /** The `telegram_users` row (found or just created). */
  user: TelegramUserRow;
  startParam?: string;
}

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

const USER_COLUMNS =
  "id, telegram_user_id, telegram_username, first_name, last_name, language_code, " +
  "first_seen_at, started_bot_at, last_seen_at, first_subscription_at, " +
  "current_streak_months, operational_status, created_at, updated_at";
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/** Pull the raw initData string out of a request's headers. */
export function extractInitData(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, ...rest] = auth.split(" ");
    if (scheme.toLowerCase() === "tma" && rest.length > 0) {
      return rest.join(" ").trim();
    }
  }
  const header = req.headers.get("x-telegram-init-data");
  return header ? header.trim() : null;
}

/**
 * Validate the request's initData and resolve (or create) the matching
 * `telegram_users` row. Throws `AuthError` on any failure.
 */
export async function authenticate(req: Request): Promise<AuthContext> {
  const initData = extractInitData(req);
  if (!initData) {
    throw new AuthError(401, "missing_init_data", "No Telegram initData provided");
  }

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_INIT_DATA_MAX_AGE_SECONDS } = telegramEnv();
  let validated;
  try {
    validated = validateInitData(initData, TELEGRAM_BOT_TOKEN, {
      maxAgeSeconds: TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    });
  } catch (err) {
    if (err instanceof InitDataError) {
      throw new AuthError(401, `init_data_${err.code}`, err.message);
    }
    throw err;
  }

  const supabase = createAdminClient();
  const user = await findOrCreateUser(supabase, validated.user);

  return {
    supabase,
    tgUser: validated.user,
    user,
    startParam: validated.startParam,
  };
}

async function findOrCreateUser(
  supabase: AdminClient,
  tgUser: TelegramWebAppUser,
): Promise<TelegramUserRow> {
  const nowIso = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("telegram_users")
    .select(USER_COLUMNS)
    .eq("telegram_user_id", tgUser.id)
    .maybeSingle();

  if (selectError) {
    throw new AuthError(500, "db_error", selectError.message);
  }

  if (existing) {
    const existingRow = existing as unknown as TelegramUserRow;
    const profilePatch = compactProfile({
      telegram_username: tgUser.username,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name,
      language_code: tgUser.language_code,
    });
    const shouldTouchLastSeen =
      !existingRow.last_seen_at ||
      Date.now() - new Date(existingRow.last_seen_at).getTime() >= LAST_SEEN_THROTTLE_MS;
    const patch = {
      ...changedProfilePatch(existingRow, profilePatch),
      ...(shouldTouchLastSeen ? { last_seen_at: nowIso } : {}),
    };
    if (Object.keys(patch).length === 0) return existingRow;

    // Refresh lightweight profile fields without overwriting lifecycle fields.
    const { data: updated, error: updateError } = await supabase
      .from("telegram_users")
      .update(patch)
      .eq("id", existingRow.id)
      .select(USER_COLUMNS)
      .single();

    if (updateError) {
      throw new AuthError(500, "db_error", updateError.message);
    }
    return updated as unknown as TelegramUserRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("telegram_users")
    .insert({
      telegram_user_id: tgUser.id,
      telegram_username: tgUser.username ?? null,
      first_name: tgUser.first_name ?? null,
      last_name: tgUser.last_name ?? null,
      language_code: tgUser.language_code ?? null,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    })
    .select(USER_COLUMNS)
    .single();

  if (insertError) {
    // Handle the race where a concurrent request inserted the same user first.
    if (insertError.code === "23505") {
      const { data: raced, error: refetchError } = await supabase
        .from("telegram_users")
        .select(USER_COLUMNS)
        .eq("telegram_user_id", tgUser.id)
        .single();
      if (refetchError) {
        throw new AuthError(500, "db_error", refetchError.message);
      }
      return raced as unknown as TelegramUserRow;
    }
    throw new AuthError(500, "db_error", insertError.message);
  }

  return inserted as unknown as TelegramUserRow;
}

function compactProfile(
  profile: Partial<Pick<TelegramUserRow, "telegram_username" | "first_name" | "last_name" | "language_code">>,
): Partial<Pick<TelegramUserRow, "telegram_username" | "first_name" | "last_name" | "language_code">> {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined && value !== null),
  );
}

function changedProfilePatch(
  existing: TelegramUserRow,
  patch: Partial<Pick<TelegramUserRow, "telegram_username" | "first_name" | "last_name" | "language_code">>,
): Partial<Pick<TelegramUserRow, "telegram_username" | "first_name" | "last_name" | "language_code">> {
  return Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => existing[key as keyof TelegramUserRow] !== value),
  );
}
