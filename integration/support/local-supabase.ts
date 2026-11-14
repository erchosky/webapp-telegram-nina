import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LocalStatus = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
};

let cached: LocalStatus | null = null;

export function localSupabaseStatus(): LocalStatus {
  if (cached) return cached;
  const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error("Supabase local status did not return JSON");
  cached = JSON.parse(output.slice(jsonStart)) as LocalStatus;
  return cached;
}

export function localClients(): {
  anon: SupabaseClient;
  service: SupabaseClient;
  status: LocalStatus;
} {
  const status = localSupabaseStatus();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    status,
    anon: createClient(status.API_URL, status.ANON_KEY, options),
    service: createClient(status.API_URL, status.SERVICE_ROLE_KEY, options),
  };
}
