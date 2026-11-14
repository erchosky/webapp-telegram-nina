import { expect, test } from "@playwright/test";
import { localClients } from "../integration/support/local-supabase";

const FIXTURE_USER = "10000000-0000-4000-8000-000000000001";
const PUBLIC_CATEGORY = "60000000-0000-4000-8000-000000000001";
const PUBLIC_ITEM = "70000000-0000-4000-8000-000000000001";
const HIDDEN_ITEM = "70000000-0000-4000-8000-000000000002";
const fakeTelegramOrigin = "http://127.0.0.1:4010";

test.describe("Telegram MiniApp harness", () => {
  const { service } = localClients();

  test.beforeEach(async () => {
    await service.from("rate_limit_buckets").delete().eq("key", "/api/marketplace/interest:700000001");
    await service
      .from("purchase_interests")
      .delete()
      .eq("telegram_user_id", FIXTURE_USER)
      .eq("item_id", PUBLIC_ITEM);
    await service.from("marketplace_categories").update({ status: "published" }).eq("id", PUBLIC_CATEGORY);
    await service.from("marketplace_items").update({ public_visible: true, status: "available" }).eq("id", PUBLIC_ITEM);
    await fetch(`${fakeTelegramOrigin}/__test__/reset`, { method: "POST", body: "{}" });
  });

  test.afterEach(async () => {
    await service.from("marketplace_categories").update({ status: "published" }).eq("id", PUBLIC_CATEGORY);
    await service.from("marketplace_items").update({ public_visible: true, status: "available" }).eq("id", PUBLIC_ITEM);
  });

  test("loads signed Telegram identity and creates one interest on double submit", async ({ page }) => {
    const meResponse = page.waitForResponse((response) => response.url().endsWith("/api/me"));
    await page.goto("/e2e-harness/telegram?user=member");
    expect((await meResponse).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Ángela" })).toBeVisible();

    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("Producto público fixture")).toBeVisible();
    await expect(page.getByText("Producto oculto fixture")).toHaveCount(0);

    const submit = page.getByRole("button", { name: "Me interesa" });
    await expect(submit).toBeEnabled();
    await submit.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByText(/Interés registrado/)).toBeVisible();

    const interests = await service
      .from("purchase_interests")
      .select("id")
      .eq("telegram_user_id", FIXTURE_USER)
      .eq("item_id", PUBLIC_ITEM)
      .in("status", ["requested", "seen", "in_review"]);
    expect(interests.error).toBeNull();
    expect(interests.data).toHaveLength(1);
    const telegramState = await fetch(`${fakeTelegramOrigin}/__test__/state`).then((response) => response.json()) as {
      counts?: Record<string, number>;
    };
    expect(telegramState.counts?.sendMessage).toBe(1);
  });

  test("shows authentication failure for a cryptographically altered credential", async ({ page }) => {
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/me"));
    await page.goto("/e2e-harness/telegram?credential=tampered");
    expect((await responsePromise).status()).toBe(401);
    await expect(page.getByText(/No se pudo cargar tu estado VIP/)).toBeVisible();
  });

  test("renders explicit loading and empty catalog states", async ({ page }) => {
    await page.route("**/api/marketplace", async (route) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
      await route.continue();
    });
    await page.goto("/e2e-harness/telegram");
    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("Cargando privado...")).toBeVisible();
    await expect(page.getByText("Producto público fixture")).toBeVisible();

    await service.from("marketplace_items").update({ public_visible: false }).eq("id", PUBLIC_ITEM);
    await page.reload();
    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("No hay nada visible ahora")).toBeVisible();
  });

  test("rejects a hidden product ID and keeps the mobile navigation usable", async ({ page }, testInfo) => {
    await page.goto("/e2e-harness/telegram");
    const direct = await page.evaluate(async ({ hiddenItem }) => {
      const initData = window.Telegram?.WebApp?.initData ?? "";
      const response = await fetch("/api/marketplace/interest", {
        method: "POST",
        headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
        body: JSON.stringify({ itemId: hiddenItem }),
      });
      return { status: response.status, body: await response.json() };
    }, { hiddenItem: HIDDEN_ITEM });
    expect(direct.status).toBe(404);
    expect(direct.body).toMatchObject({ ok: false, error: { code: "item_not_visible" } });

    if (testInfo.project.name === "chromium-mobile") {
      expect(page.viewportSize()?.width).toBeLessThanOrEqual(450);
      await expect(page.getByRole("tablist", { name: "Navegación principal" })).toBeVisible();
      await page.getByRole("tab", { name: "Contacto" }).click();
      await expect(page.getByRole("tab", { name: "Contacto" })).toHaveAttribute("aria-selected", "true");
    }
  });
});
