import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
import { safeEqual } from "./secrets";
import { rateLimit } from "./rate-limit";
import { serverEnvSchema } from "../env";

describe("security helpers", () => {
  it("compara secretos sin aceptar tipos o valores distintos", () => {
    expect(safeEqual("correcto", "correcto")).toBe(true);
    expect(safeEqual("incorrecto", "correcto")).toBe(false);
    expect(safeEqual(null, "correcto")).toBe(false);
  });
  it("bloquea al superar el límite", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(false);
  });
  it("rechaza TELEGRAM_WEBHOOK_SECRET con caracteres no permitidos por Telegram", () => {
    const base = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32),
      TELEGRAM_BOT_TOKEN: "123456789:token",
      TELEGRAM_WEBHOOK_SECRET: "secret con espacios!",
      CRON_SECRET: "x".repeat(32),
      ADMIN_PASSWORD: "x".repeat(12),
      SESSION_SECRET: "x".repeat(32)
    };
    expect(() => serverEnvSchema.parse(base)).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });
});
