import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_COOKIE, readAdminTokenPayload, signAdminToken, verifyAdminTokenWithSecret } from "./admin-token";

export { ADMIN_COOKIE };

const SESSION_TTL_MS = 12 * 60 * 60 * 1_000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function optionalHash(value?: string | null) {
  return value ? sha256(value) : null;
}

export async function createAdminToken(input: { userAgent?: string | null; ip?: string | null } = {}) {
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { error } = await createAdminClient().from("admin_sessions").insert({
    id: sessionId,
    session_token_hash: sha256(sessionToken),
    expires_at: expiresAt.toISOString(),
    user_agent: input.userAgent?.slice(0, 500) ?? null,
    ip_hash: optionalHash(input.ip)
  });
  if (error) throw error;
  return signAdminToken(serverEnv().SESSION_SECRET, { session_id: sessionId, session_token: sessionToken }, expiresAt);
}

export async function verifyAdminToken(token?: string) {
  const payload = await readAdminTokenPayload(token, serverEnv().SESSION_SECRET);
  if (!payload) return false;
  try {
    const { data, error } = await createAdminClient()
      .from("admin_sessions")
      .select("id,session_token_hash,expires_at,revoked_at")
      .eq("id", payload.session_id)
      .maybeSingle();
    if (error || !data || data.revoked_at) return false;
    if (new Date(data.expires_at) <= new Date()) return false;
    const ok = data.session_token_hash === sha256(payload.session_token);
    if (ok) {
      await createAdminClient().from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", payload.session_id);
    }
    return ok;
  } catch (error) {
    console.error("admin_session_verify_failed", error);
    return false;
  }
}

export async function currentAdminSessionId() {
  const payload = await readAdminTokenPayload((await cookies()).get(ADMIN_COOKIE)?.value, serverEnv().SESSION_SECRET);
  return payload?.session_id ?? null;
}

export async function isAdmin() {
  return verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }
}

export async function revokeAdminToken(token?: string) {
  const payload = await readAdminTokenPayload(token, serverEnv().SESSION_SECRET);
  if (!payload) return false;
  try {
    const { error } = await createAdminClient()
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", payload.session_id)
      .is("revoked_at", null);
    return !error;
  } catch (error) {
    console.error("admin_session_revoke_failed", error);
    return false;
  }
}

export async function revokeCurrentAdminSession() {
  return revokeAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function revokeAllAdminSessions() {
  const { error } = await createAdminClient()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);
  if (error) throw error;
}

export async function revokeOtherAdminSessions() {
  const currentId = await currentAdminSessionId();
  if (!currentId) return;
  const { error } = await createAdminClient()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null)
    .neq("id", currentId);
  if (error) throw error;
}

export { verifyAdminTokenWithSecret };
