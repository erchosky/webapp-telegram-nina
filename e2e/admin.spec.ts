import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { localClients } from "../integration/support/local-supabase";

const ADMIN_PASSWORD = "Fixture-admin-password-2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Selector de espacios" })).toBeVisible();
}

test.describe("admin browser flows", () => {
  const { service } = localClients();

  async function cleanupMarketplaceFixture() {
    const categories = await service.from("marketplace_categories").select("id,image_storage_path").eq("slug", "e2e-integrity");
    const categoryIds = (categories.data ?? []).map((row) => row.id);
    if (categoryIds.length === 0) return;
    const items = await service.from("marketplace_items").select("id").in("category_id", categoryIds);
    const itemIds = (items.data ?? []).map((row) => row.id);
    if (itemIds.length > 0) {
      const images = await service.from("marketplace_item_images").select("storage_path").in("item_id", itemIds);
      const paths = (images.data ?? []).map((row) => row.storage_path).filter((path): path is string => typeof path === "string");
      if (paths.length > 0) await service.storage.from("creator-assets").remove(paths);
      await service.from("purchase_interests").delete().in("item_id", itemIds);
      await service.from("marketplace_items").delete().in("id", itemIds);
    }
    const categoryPaths = (categories.data ?? []).map((row) => row.image_storage_path).filter((path): path is string => typeof path === "string");
    if (categoryPaths.length > 0) await service.storage.from("creator-assets").remove(categoryPaths);
    await service.from("marketplace_categories").delete().in("id", categoryIds);
  }

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "Admin flow is covered once on desktop Chromium");
    await service.from("rate_limit_buckets").delete().like("key", "admin-login:%");
    await cleanupMarketplaceFixture();
  });

  test.afterEach(async () => {
    await cleanupMarketplaceFixture();
  });

  test("logs in, navigates and exports a private no-store CSV", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "VIP Guard" }).click();
    await expect(page).toHaveURL(/\/admin\/vip-guard$/);
    await page.getByRole("link", { name: "Usuarios" }).click();
    await expect(page).toHaveURL(/\/admin\/vip-guard\/users/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const csv = await readFile(path!, "utf8");
    expect(csv).toContain("telegram_id");
    expect(csv).not.toContain("session_token_hash");
    expect(csv).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("a database-revoked admin session loses access on the next server check", async ({ page }) => {
    await login(page);
    const revoked = await service
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .is("revoked_at", null);
    expect(revoked.error).toBeNull();

    await page.goto("/admin/vip-guard/users");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Panel privado" })).toBeVisible();
  });

  test("administra el ciclo completo del marketplace y conserva el interés al archivar", async ({ page }) => {
    await login(page);
    await page.goto("/admin/webapp/categories");
    const newCategory = page.locator("#new-category");
    await newCategory.getByLabel("Slug").fill("e2e-integrity");
    await newCategory.getByLabel("Título").fill("Categoría E2E integridad");
    await newCategory.getByLabel("Descripción").fill("Categoría creada desde el CMS");
    const categoryPng = await page.screenshot();
    await newCategory.locator('input[name="image_file"]').setInputFiles({ name: "categoria.png", mimeType: "image/png", buffer: categoryPng });
    await expect(newCategory.getByText(/WebP optimizado/)).toBeVisible();
    await newCategory.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByText("Categoría E2E integridad").first()).toBeVisible();

    await page.goto("/admin/webapp/marketplace");
    const newProduct = page.locator("#new-product");
    await newProduct.locator("summary").click();
    await newProduct.getByLabel("Título").fill("Producto E2E integridad");
    await newProduct.getByLabel("Categoría").selectOption({ label: "Categoría E2E integridad" });
    await newProduct.getByLabel("Descripción").fill("Detalle dinámico inicial");
    await newProduct.getByLabel("Condiciones visibles").fill("Condición visible inicial");
    await newProduct.getByLabel("Etiqueta precio").fill("29 € bajo consulta");
    await newProduct.getByLabel("CTA").fill("Solicitar E2E");
    const productPng = await page.screenshot();
    await newProduct.locator('input[name="image_file"]').setInputFiles({ name: "producto.png", mimeType: "image/png", buffer: productPng });
    await expect(newProduct.getByText(/WebP optimizado/)).toBeVisible();
    await expect(newProduct.getByText("Producto E2E integridad", { exact: true })).toBeVisible();
    await expect(newProduct.getByText("Condición visible inicial", { exact: true })).toBeVisible();
    await newProduct.getByRole("button", { name: "Crear producto" }).click();
    await expect(page.getByRole("heading", { name: "Producto E2E integridad" })).toBeVisible();

    await page.goto("/e2e-harness/telegram?user=member");
    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("Categoría E2E integridad").first()).toBeVisible();
    const card = page.getByText("Producto E2E integridad", { exact: true })
      .locator("xpath=ancestor::*[.//button[normalize-space()='Ver detalle']][1]");
    await card.getByRole("button", { name: "Ver detalle" }).click();
    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("heading", { name: "Producto E2E integridad" })).toBeVisible();
    await expect(detail.getByText("Condición visible inicial")).toBeVisible();
    await expect(detail.getByRole("img", { name: "Producto E2E integridad" })).toBeVisible();
    await detail.getByRole("button", { name: "Solicitar E2E" }).click();
    await expect(page.getByText(/Interés registrado/)).toBeVisible();

    await page.goto("/admin/webapp/interests");
    const interest = page.locator("article").filter({ hasText: "Producto E2E integridad" });
    await expect(interest).toContainText("Categoría E2E integridad");
    await page.getByLabel("Artículo").selectOption({ label: "Producto E2E integridad" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/item=/);
    await expect(page.locator("article").filter({ hasText: "Producto E2E integridad" })).toHaveCount(1);
    const interestDownloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV filtrado" }).click();
    const interestDownload = await interestDownloadPromise;
    const interestCsv = await readFile((await interestDownload.path())!, "utf8");
    expect(interestCsv).toContain("Producto E2E integridad");
    expect(interestCsv).toContain("Categoría E2E integridad");

    await page.goto("/admin/webapp/marketplace");
    const product = page.locator("article").filter({ hasText: "Producto E2E integridad" });
    await product.locator("summary").click();
    await product.getByLabel("Título").fill("Producto E2E actualizado");
    await product.getByRole("button", { name: "Guardar producto" }).click();
    await page.goto("/e2e-harness/telegram?user=member");
    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("Producto E2E actualizado")).toBeVisible();

    await page.goto("/admin/webapp/marketplace");
    const updated = page.locator("article").filter({ hasText: "Producto E2E actualizado" });
    page.once("dialog", (dialog) => dialog.accept());
    await updated.getByRole("button", { name: "Archivar" }).click();
    await expect(page.getByRole("button", { name: "Restaurar oculto" })).toBeVisible();

    const category = await service.from("marketplace_categories").select("id,image_storage_path").eq("slug", "e2e-integrity").single();
    expect(category.error).toBeNull();
    expect(category.data?.image_storage_path).toMatch(/^marketplace\/categories\/.+\.webp$/);
    const item = await service.from("marketplace_items").select("id,status").eq("title", "Producto E2E actualizado").single();
    expect(item.data?.status).toBe("archived");
    const storedInterest = await service.from("purchase_interests").select("id,category_id,status").eq("item_id", item.data!.id).single();
    expect(storedInterest.error).toBeNull();
    expect(storedInterest.data?.category_id).toBe(category.data?.id);
    const storedImage = await service.from("marketplace_item_images").select("storage_path,mime_type,width,height,is_primary").eq("item_id", item.data!.id).single();
    expect(storedImage.data).toMatchObject({ mime_type: "image/webp", is_primary: true });
    expect(storedImage.data?.storage_path).toMatch(/^marketplace\/items\/.+\.webp$/);
    expect(Number(storedImage.data?.width)).toBeGreaterThanOrEqual(32);

    await page.getByRole("button", { name: "Restaurar oculto" }).click();
    await expect(page.getByRole("heading", { name: "Producto E2E actualizado" })).toBeVisible();
    const restored = await service.from("marketplace_items").select("status,public_visible").eq("id", item.data!.id).single();
    expect(restored.data).toMatchObject({ status: "hidden", public_visible: false });
    await page.goto("/e2e-harness/telegram?user=member");
    await page.getByRole("tab", { name: "Privado" }).click();
    await expect(page.getByText("Producto E2E actualizado")).toHaveCount(0);
  });
});
