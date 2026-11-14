import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "@/lib/env";

type AdminSupabaseClient = ReturnType<typeof createClient<any, "public", any>>;

/**
 * Service-role Supabase client. SERVER-SIDE ONLY.
 *
 * RLS is closed (no anon/authenticated policies), so all Mini App reads/writes
 * go through API routes / Server Actions using this admin client. The service
 * key must never reach the browser.
 */
const globalAdminClient = globalThis as typeof globalThis & {
  __vipGuardSupabaseAdminClient?: AdminSupabaseClient;
  __vipGuardSupabaseAdminClientKey?: string;
};

export function createAdminClient() {
  const env = supabaseAdminEnv();
  const cacheKey = `${env.SUPABASE_URL}:${env.SUPABASE_SERVICE_ROLE_KEY}`;
  if (globalAdminClient.__vipGuardSupabaseAdminClient && globalAdminClient.__vipGuardSupabaseAdminClientKey === cacheKey) {
    return globalAdminClient.__vipGuardSupabaseAdminClient;
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  globalAdminClient.__vipGuardSupabaseAdminClient = client;
  globalAdminClient.__vipGuardSupabaseAdminClientKey = cacheKey;
  return client;
}

export type AdminClient = ReturnType<typeof createAdminClient>;
