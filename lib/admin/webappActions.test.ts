import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  assertNotReadOnly: vi.fn(),
  headers: vi.fn(),
  checkRateLimit: vi.fn(),
  requestIp: vi.fn(),
  auditLog: vi.fn(),
  revalidatePath: vi.fn(),
  createAdminClient: vi.fn(),
  validateImageFile: vi.fn(),
  uploadValidatedImage: vi.fn(),
  removeOwnedImage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/security/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/modes", () => ({ assertNotReadOnly: mocks.assertNotReadOnly }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  requestIp: mocks.requestIp,
}));
vi.mock("@/lib/logs", () => ({ auditLog: mocks.auditLog }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/admin/imageUpload", () => ({
  validateImageFile: mocks.validateImageFile,
  uploadValidatedImage: mocks.uploadValidatedImage,
  removeOwnedImage: mocks.removeOwnedImage,
  isOwnedImagePath: vi.fn(() => true),
  storagePathFromPublicUrl: vi.fn(() => null),
}));

import { deleteRow, markItemImagePrimary, saveCategory, saveItemImage, saveMarketplaceSettings, updateInterest } from "./webappActions";

function categoryForm() {
  const form = new FormData();
  form.set("slug", "prints");
  form.set("title", "Prints");
  form.set("status", "published");
  form.set("sort_order", "10");
  return form;
}

function dbForInsert(id = "row-1") {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
        })),
      })),
      update: vi.fn(),
    })),
  };
}

describe("webapp admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSameOrigin.mockResolvedValue(undefined);
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.assertNotReadOnly.mockResolvedValue(undefined);
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.requestIp.mockReturnValue("203.0.113.10");
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.validateImageFile.mockResolvedValue(null);
    mocks.uploadValidatedImage.mockResolvedValue({ storagePath: "marketplace/items/new.webp", publicUrl: "https://demo.supabase.co/storage/v1/object/public/creator-assets/marketplace/items/new.webp" });
    mocks.removeOwnedImage.mockResolvedValue(true);
    mocks.createAdminClient.mockReturnValue(dbForInsert());
  });

  it("rechaza una mutación si falla same-origin antes de tocar la base de datos", async () => {
    mocks.assertSameOrigin.mockRejectedValueOnce(new Error("Origen no permitido"));

    await expect(saveCategory(categoryForm())).rejects.toThrow("Origen no permitido");

    expect(mocks.assertSameOrigin).toHaveBeenCalled();
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("audita mutaciones WebApp con tabla e id afectado", async () => {
    mocks.createAdminClient.mockReturnValue(dbForInsert("cat-1"));

    await saveCategory(categoryForm());

    expect(mocks.auditLog).toHaveBeenCalledWith(
      "webapp_category_created",
      "Categoría WebApp creada",
      undefined,
      expect.objectContaining({
        module: "webapp",
        table: "marketplace_categories",
        id: "cat-1",
        slug: "prints",
      }),
    );
  });

  it("deleteRow solo opera sobre tablas permitidas, archiva y audita", async () => {
    const updates: Array<{ table: string; payload: unknown; id: string }> = [];
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { status: "available", updated_at: "v1" }, error: null })) })) })),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn((_column: string, id: string) => {
            updates.push({ table, payload, id });
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id }, error: null })),
                })),
              })),
            };
          }),
        })),
      })),
    });
    const form = new FormData();
    form.set("table", "marketplace_items");
    form.set("id", "item-1");

    await deleteRow(form);

    expect(updates).toEqual([{ table: "marketplace_items", payload: { status: "archived" }, id: "item-1" }]);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      "webapp_row_archived",
      expect.any(String),
      undefined,
      expect.objectContaining({ table: "marketplace_items", id: "item-1" }),
    );
  });

  it("saveItemImage desmarca otras imágenes cuando se crea una nueva principal", async () => {
    const updates: Array<{ payload: unknown; itemId: string }> = [];
    const inserts: unknown[] = [];
    mocks.validateImageFile.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "image/webp", extension: "webp", size: 1, width: 100, height: 100 });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [{ id: "old", storage_path: "marketplace/items/old.webp", is_primary: true }], error: null })) })) })),
        })),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn((_: string, itemId: string) => {
            updates.push({ payload, itemId });
            return { throwOnError: vi.fn().mockResolvedValue({ error: null }) };
          }),
        })),
        insert: vi.fn((payload: unknown) => {
          inserts.push(payload);
          return { select: () => ({ single: async () => ({ data: { id: "image-1" }, error: null }) }) };
        }),
      })),
    });
    const form = new FormData();
    form.set("item_id", "item-1");
    form.set("image_file", new File(["image"], "image.webp", { type: "image/webp" }));
    form.set("is_primary", "on");

    await saveItemImage(form);

    expect(updates).toEqual([{ payload: { is_primary: false }, itemId: "item-1" }]);
    expect(inserts[0]).toMatchObject({ item_id: "item-1", is_primary: true });
  });

  it("saveItemImage exige seleccionar un archivo", async () => {
    const form = new FormData();
    form.set("item_id", "item-1");

    await expect(saveItemImage(form)).rejects.toThrow("Selecciona una imagen para subir");
  });

  it("markItemImagePrimary deja una sola imagen principal por item", async () => {
    const updates: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn((payload: unknown) => {
          updates.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
              throwOnError: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }),
      })),
    });
    const form = new FormData();
    form.set("item_id", "item-1");
    form.set("image_id", "image-2");

    await markItemImagePrimary(form);

    expect(updates).toEqual([{ is_primary: false }, { is_primary: true }]);
  });

  it("guarda personalización controlada sin aceptar una cabecera arbitraria", async () => {
    const upserts: unknown[] = [];
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { value: {} }, error: null })) })) })),
        upsert: vi.fn(async (payload: unknown) => {
          upserts.push(payload);
          return { error: null };
        }),
      })),
    });
    const form = marketplaceSettingsForm();
    form.set("marketplaceHeaderImageUrl", "https://assets.supabase.co/storage/v1/object/public/creator-assets/header.jpg");

    await saveMarketplaceSettings(form);

    expect(upserts[0]).toMatchObject({
      key: "marketplace",
      is_public: true,
      value: expect.objectContaining({
        marketplaceHeadline: "Privado E2E",
        marketplaceAvailableLabel: "Disponible ahora",
      }),
    });
    const invalid = marketplaceSettingsForm();
    invalid.set("marketplaceHeaderImageUrl", "https://attacker.example/header.jpg");
    await expect(saveMarketplaceSettings(invalid)).rejects.toThrow("URL pública inválida");
  });

  it("evita pisar un interés modificado simultáneamente por otro administrador", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { status: "requested", internal_notes: null, updated_at: "v1" }, error: null })) })) })),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) })) })),
      })),
    });
    const form = new FormData();
    form.set("id", "interest-1");
    form.set("status", "seen");

    await expect(updateInterest(form)).rejects.toThrow("Otro administrador modificó este interés");
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});

function marketplaceSettingsForm() {
  const form = new FormData();
  form.set("marketplaceHeadline", "Privado E2E");
  form.set("marketplaceIntro", "Texto introductorio");
  form.set("marketplaceEmptyTitle", "Vacío");
  form.set("marketplaceEmptyBody", "Sin artículos");
  form.set("marketplaceAvailableLabel", "Disponible ahora");
  form.set("marketplaceReservedLabel", "Apartado");
  form.set("marketplaceSoldLabel", "Agotado");
  return form;
}
