import "server-only";
export const ADMIN_COOKIE = "vip_guard_admin";
const encoder = new TextEncoder();

export type AdminTokenPayload = {
  role: "admin";
  session_id: string;
  session_token: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signAdminToken(secret: string, payload: Pick<AdminTokenPayload, "session_id" | "session_token">, expiresAt: Date) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({
    role: "admin",
    session_id: payload.session_id,
    session_token: payload.session_token,
    iat: Math.floor(Date.now() / 1_000),
    exp: Math.floor(expiresAt.getTime() / 1_000)
  }));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${base64UrlEncode(await hmac(secret, unsigned))}`;
}

export async function readAdminTokenPayload(token: string | undefined, secret: string | undefined): Promise<AdminTokenPayload | null> {
  if (!token || !secret) return null;
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const unsigned = `${header}.${body}`;
    const expected = base64UrlEncode(await hmac(secret, unsigned));
    if (!timingSafeEqual(signature, expected)) return null;
    const payload = JSON.parse(base64UrlDecode(body)) as Partial<AdminTokenPayload>;
    if (payload.role !== "admin" || typeof payload.session_id !== "string" || typeof payload.session_token !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1_000)) return null;
    return payload as AdminTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyAdminTokenWithSecret(token: string | undefined, secret: string | undefined) {
  return Boolean(await readAdminTokenPayload(token, secret));
}
