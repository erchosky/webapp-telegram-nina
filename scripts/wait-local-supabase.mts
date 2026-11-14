import { execFileSync } from "node:child_process";

type LocalStatus = {
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

const timeoutMs = Number.parseInt(process.env.SUPABASE_READY_TIMEOUT_MS ?? "60000", 10);
const startedAt = Date.now();
let lastFailure = "Supabase status has not been read yet";

while (Date.now() - startedAt < timeoutMs) {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const jsonStart = output.indexOf("{");
    if (jsonStart < 0) throw new Error("status JSON missing");
    const status = JSON.parse(output.slice(jsonStart)) as LocalStatus;
    const response = await fetch(`${status.API_URL}/rest/v1/telegram_users?select=id&limit=1`, {
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) {
      console.log(`Supabase REST schema ready in ${Date.now() - startedAt} ms.`);
      process.exit(0);
    }
    lastFailure = `REST returned HTTP ${response.status}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
}

throw new Error(`Supabase REST schema was not ready after ${timeoutMs} ms: ${lastFailure}`);
