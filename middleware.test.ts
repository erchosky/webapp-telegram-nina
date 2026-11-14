import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

describe("admin middleware", () => {
  it("redirige /admin sin cookie antes de renderizar contenido privado", async () => {
    const response = await middleware(new NextRequest("https://vip.example.com/admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://vip.example.com/admin/login");
  });

  it("redirige páginas privadas sin filtrar nombres, settings ni logs", async () => {
    for (const path of ["/admin/users", "/admin/settings", "/admin/logs", "/admin/subscriptions"]) {
      const response = await middleware(new NextRequest(`https://vip.example.com${path}`));
      const text = await response.text();

      expect(response.status).toBe(307);
      expect(text).not.toContain("Todo bajo control");
      expect(text).not.toContain("Telegram Chat ID");
      expect(text).not.toContain("Suscripciones");
      expect(text).not.toContain("Actividad");
    }
  });

  it("permite /admin/login", async () => {
    const response = await middleware(new NextRequest("https://vip.example.com/admin/login"));

    expect(response.status).toBe(200);
  });

  it("devuelve 401 JSON para /api/admin sin cookie", async () => {
    const response = await middleware(new NextRequest("https://vip.example.com/api/admin/health"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false });
  });
});
