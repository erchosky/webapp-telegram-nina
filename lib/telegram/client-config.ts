import "server-only";
import { isIP } from "node:net";

export const OFFICIAL_TELEGRAM_API_ROOT = "https://api.telegram.org";
export const TEST_TELEGRAM_API_ROOT_ENV = "TEST_TELEGRAM_API_ROOT";

/**
 * Return the Telegram Bot API root used by server-side clients.
 *
 * Production and ordinary development always use Telegram's official API.
 * A custom root is accepted only for the explicit E2E harness, and even then
 * it must be a clean loopback HTTP(S) origin. This keeps the test seam from
 * becoming a general-purpose SSRF or production override.
 */
export function telegramApiRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[TEST_TELEGRAM_API_ROOT_ENV]?.trim();
  if (env.E2E_TEST_MODE !== "1" || !configured) {
    return OFFICIAL_TELEGRAM_API_ROOT;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`${TEST_TELEGRAM_API_ROOT_ENV} must be a valid loopback URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${TEST_TELEGRAM_API_ROOT_ENV} must use http or https`);
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error(`${TEST_TELEGRAM_API_ROOT_ENV} must target a loopback host`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${TEST_TELEGRAM_API_ROOT_ENV} must be an origin without credentials, path, query, or hash`);
  }

  // URL#origin removes the trailing slash rejected by grammY's apiRoot option.
  return url.origin;
}

export function telegramApiMethodUrl(
  token: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(method)) {
    throw new Error("Invalid Telegram Bot API method name");
  }
  return `${telegramApiRoot(env)}/bot${token}/${method}`;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  if (isIP(normalized) !== 4) return false;
  return normalized.split(".")[0] === "127";
}
