import crypto from "node:crypto";

/**
 * Telegram Mini App `initData` validation.
 *
 * Implements the official algorithm:
 *   secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash       = HMAC_SHA256(key=secret_key, message=data_check_string)
 * where data_check_string is every field except `hash` and `signature`, sorted
 * by key and joined with "\n" as "key=value". The computed hash is compared in
 * constant time against the received `hash`, and `auth_date` is checked for
 * freshness.
 *
 * Pure module (no I/O, no `server-only`) so it can be unit-tested directly.
 */

/** Default max age for `auth_date` (2h), beyond which initData is rejected. */
export const DEFAULT_MAX_AGE_SECONDS = 2 * 60 * 60;
export const MAX_FUTURE_AUTH_DATE_SECONDS = 60;
/** Hard ceiling for an encoded Mini App credential (measured as UTF-8 bytes). */
export const MAX_INIT_DATA_BYTES = 16 * 1024;

const MAX_NAME_LENGTH = 64;
const MAX_USERNAME_LENGTH = 32;
const MAX_LANGUAGE_LENGTH = 16;

export interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramWebAppUser;
  authDate: Date;
  startParam?: string;
  queryId?: string;
}

export type InitDataErrorCode =
  | "missing"
  | "malformed"
  | "too_large"
  | "duplicate_field"
  | "missing_hash"
  | "bad_hash"
  | "missing_auth_date"
  | "expired"
  | "future_auth_date"
  | "missing_user"
  | "bot_user";

export class InitDataError extends Error {
  readonly code: InitDataErrorCode;
  constructor(code: InitDataErrorCode, message?: string) {
    super(message ?? code);
    this.name = "InitDataError";
    this.code = code;
  }
}

export interface ValidateOptions {
  /** Max allowed age of `auth_date` in seconds. */
  maxAgeSeconds?: number;
  /** Injectable clock for testing. */
  now?: Date;
}

export function validateInitData(
  initData: string,
  botToken: string,
  options: ValidateOptions = {},
): ValidatedInitData {
  if (!initData || typeof initData !== "string") {
    throw new InitDataError("missing", "initData is empty");
  }
  if (!botToken) {
    throw new InitDataError("malformed", "bot token is empty");
  }
  if (Buffer.byteLength(initData, "utf8") > MAX_INIT_DATA_BYTES) {
    throw new InitDataError("too_large", "initData exceeds the maximum encoded size");
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new InitDataError("malformed", "initData is not a valid query string");
  }

  const seenKeys = new Set<string>();
  for (const key of params.keys()) {
    if (seenKeys.has(key)) {
      throw new InitDataError("duplicate_field", `initData contains duplicate field: ${key}`);
    }
    seenKeys.add(key);
  }

  const hash = params.get("hash");
  if (!hash) {
    throw new InitDataError("missing_hash", "initData has no hash");
  }

  // Build the data-check-string: every field except `hash` and `signature`.
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === "hash" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!safeHexEqual(computedHash, hash)) {
    throw new InitDataError("bad_hash", "initData hash mismatch");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new InitDataError("missing_auth_date", "initData has no auth_date");
  }
  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    throw new InitDataError("missing_auth_date", "initData auth_date is invalid");
  }

  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  if (authDateSeconds > nowSeconds + MAX_FUTURE_AUTH_DATE_SECONDS) {
    throw new InitDataError("future_auth_date", "initData auth_date is too far in the future");
  }
  if (nowSeconds - authDateSeconds > maxAge) {
    throw new InitDataError("expired", "initData auth_date is too old");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InitDataError("missing_user", "initData has no user");
  }
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new InitDataError("missing_user", "initData user is not valid JSON");
  }
  if (typeof user.id !== "number" || !Number.isFinite(user.id)) {
    throw new InitDataError("missing_user", "initData user has no numeric id");
  }
  if (user.is_bot === true) {
    throw new InitDataError("bot_user", "Telegram bot users are not allowed");
  }

  user = sanitizeTelegramUser(user);

  return {
    user,
    authDate: new Date(authDateSeconds * 1000),
    startParam: params.get("start_param") ?? undefined,
    queryId: params.get("query_id") ?? undefined,
  };
}

function sanitizeTelegramUser(user: TelegramWebAppUser): TelegramWebAppUser {
  return {
    ...user,
    first_name: sanitizeText(user.first_name, MAX_NAME_LENGTH),
    last_name: sanitizeText(user.last_name, MAX_NAME_LENGTH),
    username: sanitizeUsername(user.username),
    language_code: sanitizeText(user.language_code, MAX_LANGUAGE_LENGTH),
  };
}

function sanitizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function sanitizeUsername(value: unknown): string | undefined {
  const normalized = sanitizeText(value, MAX_USERNAME_LENGTH);
  if (!normalized) return undefined;
  const cleaned = normalized.replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "");
  return cleaned ? cleaned.slice(0, MAX_USERNAME_LENGTH) : undefined;
}

/** Constant-time comparison of two hex strings. */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "hex");
    bufB = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Build a signed `initData` string for a given payload. Intended for tests and
 * local tooling only — production initData is produced by the Telegram client.
 */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => k !== "hash" && k !== "signature")
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = pairs.join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const search = new URLSearchParams(fields);
  search.set("hash", hash);
  return search.toString();
}
