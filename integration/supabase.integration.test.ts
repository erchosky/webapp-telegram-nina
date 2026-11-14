import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localClients } from "./support/local-supabase";

const FIXTURE_USER_A = "10000000-0000-4000-8000-000000000001";
const FIXTURE_USER_NO_ACCESS = "10000000-0000-4000-8000-000000000003";
const PUBLIC_ITEM = "70000000-0000-4000-8000-000000000001";
const HIDDEN_ITEM = "70000000-0000-4000-8000-000000000002";

describe.sequential("Supabase local integration", () => {
  const { anon, service, status } = localClients();
  let authenticated: SupabaseClient;
  let authUserId: string;
  const storagePath = `integration-${Date.now()}.txt`;
  const publicStoragePath = `integration-${Date.now()}.png`;

  beforeAll(async () => {
    const email = `integration-${Date.now()}@example.test`;
    const password = "Fixture-password-123!";
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Auth fixture was not created");
    authUserId = created.data.user.id;
    authenticated = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await authenticated.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  });

  afterAll(async () => {
    await service.storage.from("creator-assets").remove([storagePath]);
    await service.storage.from("creator-assets").remove([publicStoragePath]);
    await service.storage.from("private-test-assets").remove([storagePath]);
    if (authUserId) await service.auth.admin.deleteUser(authUserId);
    await service
      .from("purchase_interests")
      .delete()
      .eq("telegram_user_id", FIXTURE_USER_NO_ACCESS)
      .eq("item_id", PUBLIC_ITEM);
  });

  it("denies private tables and RPCs to anon and authenticated roles", async () => {
    for (const client of [anon, authenticated]) {
      const table = await client.from("telegram_users").select("id").limit(1);
      expect(table.error).not.toBeNull();

      const rpc = await client.rpc("admin_list_users", {
        p_status: "all",
        p_limit: 1,
        p_offset: 0,
        p_now: new Date().toISOString(),
      });
      expect(rpc.error).not.toBeNull();
    }
  });

  it("allows the server service role to read deterministic fixtures", async () => {
    const result = await service
      .from("telegram_users")
      .select("id,telegram_user_id")
      .eq("id", FIXTURE_USER_A)
      .single();
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: FIXTURE_USER_A, telegram_user_id: 700000001 });
  });

  it("keeps unpublished catalog data out of the public catalog service", async () => {
    process.env.SUPABASE_URL = status.API_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
    const { getPublicMarketplaceCatalog } = await import("@/lib/marketplace/server");
    const catalog = await getPublicMarketplaceCatalog();

    expect(catalog.visibleItems.map((item) => item.id)).toContain(PUBLIC_ITEM);
    expect(catalog.visibleItems.map((item) => item.id)).not.toContain(HIDDEN_ITEM);
    expect(catalog.categories.map((category) => category.id)).not.toContain("60000000-0000-4000-8000-000000000002");
  });

  it("rejects hidden item IDOR and deduplicates concurrent interest creation", async () => {
    process.env.TELEGRAM_ADMIN_ALERT_CHAT_ID = "";
    process.env.TELEGRAM_BOT_TOKEN = "123456789:fixture_bot_token_2026";
    const { createMarketplaceInterest } = await import("@/lib/marketplace/interestServer");
    const userResult = await service
      .from("telegram_users")
      .select("*")
      .eq("id", FIXTURE_USER_NO_ACCESS)
      .single();
    if (userResult.error) throw userResult.error;
    const ctx = {
      supabase: service,
      user: userResult.data,
      tgUser: {
        id: 700000003,
        first_name: "No Access",
        username: "fixture_no_access",
      },
    } as never;

    await expect(createMarketplaceInterest(ctx, { itemId: HIDDEN_ITEM }))
      .rejects.toMatchObject({ status: 404, code: "item_not_visible" });

    const attempts = await Promise.all([
      createMarketplaceInterest(ctx, { itemId: PUBLIC_ITEM, message: "Concurrent A" }),
      createMarketplaceInterest(ctx, { itemId: PUBLIC_ITEM, message: "Concurrent B" }),
    ]);
    expect(new Set(attempts.map((interest) => interest.id)).size).toBe(1);
    const stored = await service
      .from("purchase_interests")
      .select("id")
      .eq("telegram_user_id", FIXTURE_USER_NO_ACCESS)
      .eq("item_id", PUBLIC_ITEM)
      .in("status", ["requested", "seen", "in_review"]);
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(1);
  });

  it("recorre catálogo dinámico, conserva categoría histórica y bloquea un artículo archivado", async () => {
    process.env.SUPABASE_URL = status.API_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
    process.env.TELEGRAM_ADMIN_ALERT_CHAT_ID = "";
    const suffix = Date.now();
    const firstCategoryId = crypto.randomUUID();
    const secondCategoryId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    try {
      const categories = await service.from("marketplace_categories").insert([
        { id: firstCategoryId, slug: `integrity-${suffix}`, title: "Integridad inicial", status: "published", sort_order: 1 },
        { id: secondCategoryId, slug: `integrity-moved-${suffix}`, title: "Integridad destino", status: "published", sort_order: 2 },
      ]);
      expect(categories.error).toBeNull();
      const insertedItem = await service.from("marketplace_items").insert({
        id: itemId,
        category_id: firstCategoryId,
        title: "Producto dinámico integración",
        description: "Visible desde el catálogo canónico",
        visible_terms: "Condición pública verificable",
        status: "available",
        public_visible: true,
        cta_label: "Solicitar",
      });
      expect(insertedItem.error).toBeNull();

      const { getPublicMarketplaceCatalog } = await import("@/lib/marketplace/server");
      const catalog = await getPublicMarketplaceCatalog();
      expect(catalog.visibleItems).toContainEqual(expect.objectContaining({
        id: itemId,
        categoryId: firstCategoryId,
        visibleTerms: "Condición pública verificable",
      }));

      const userResult = await service.from("telegram_users").select("*").eq("id", FIXTURE_USER_NO_ACCESS).single();
      if (userResult.error) throw userResult.error;
      const ctx = {
        supabase: service,
        user: userResult.data,
        tgUser: { id: 700000003, first_name: "No Access", username: "fixture_no_access" },
      } as never;
      const { createMarketplaceInterest } = await import("@/lib/marketplace/interestServer");
      const created = await createMarketplaceInterest(ctx, { itemId, message: "Interés de integridad" });

      await service.from("marketplace_items").update({ category_id: secondCategoryId }).eq("id", itemId);
      await service.from("marketplace_items").update({ status: "archived" }).eq("id", itemId);
      await expect(createMarketplaceInterest(ctx, { itemId })).rejects.toMatchObject({ status: 404, code: "item_not_visible" });
      const history = await service.from("purchase_interests").select("id,category_id,status").eq("id", created.id).single();
      expect(history.data).toMatchObject({ category_id: firstCategoryId, status: "requested" });
    } finally {
      await service.from("purchase_interests").delete().eq("item_id", itemId);
      await service.from("marketplace_items").delete().eq("id", itemId);
      await service.from("marketplace_categories").delete().in("id", [firstCategoryId, secondCategoryId]);
    }
  });

  it("enforces private Storage while allowing a known public object", async () => {
    const bytes = new TextEncoder().encode("synthetic storage fixture");
    const publicUpload = await service.storage.from("creator-assets").upload(storagePath, bytes, {
      contentType: "text/plain",
      upsert: true,
    });
    // The configured public bucket only accepts images; prove MIME enforcement.
    expect(publicUpload.error).not.toBeNull();

    const privateUpload = await service.storage.from("private-test-assets").upload(storagePath, bytes, {
      contentType: "text/plain",
      upsert: true,
    });
    expect(privateUpload.error).toBeNull();

    const privateAnon = await anon.storage.from("private-test-assets").download(storagePath);
    const privateAuth = await authenticated.storage.from("private-test-assets").download(storagePath);
    const privateService = await service.storage.from("private-test-assets").download(storagePath);
    expect(privateAnon.error).not.toBeNull();
    expect(privateAuth.error).not.toBeNull();
    expect(privateService.error).toBeNull();

    const listed = await anon.storage.from("private-test-assets").list();
    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([]);

    const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const imageUpload = await service.storage.from("creator-assets").upload(publicStoragePath, imageBytes, {
      contentType: "image/png",
      upsert: true,
    });
    expect(imageUpload.error).toBeNull();
    const publicResponse = await fetch(
      `${status.API_URL}/storage/v1/object/public/creator-assets/${publicStoragePath}`,
    );
    expect(publicResponse.status).toBe(200);
  });

  it("sube, sirve y elimina una imagen validada propiedad del CMS", async () => {
    const { removeOwnedImage, uploadValidatedImage, validateImageFile } = await import("@/lib/admin/imageUpload");
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 320);
    view.setUint32(20, 180);
    const image = await validateImageFile(new File([bytes], "dashboard.png", { type: "image/png" }));
    expect(image).not.toBeNull();
    const uploaded = await uploadValidatedImage(service as never, "items", image!);
    try {
      expect(uploaded.storagePath).toMatch(/^marketplace\/items\/.+\.png$/);
      const publicResponse = await fetch(uploaded.publicUrl);
      expect(publicResponse.status).toBe(200);
    } finally {
      await expect(removeOwnedImage(service as never, uploaded.storagePath)).resolves.toBe(true);
    }
  });

  it("applies distributed rate limits atomically under real concurrency", async () => {
    const key = `integration:${Date.now()}`;
    const calls = await Promise.all(
      Array.from({ length: 20 }, () => service.rpc("check_rate_limit", {
        p_key: key,
        p_limit: 5,
        p_window_ms: 60_000,
      })),
    );
    expect(calls.every((call) => call.error === null)).toBe(true);
    expect(calls.filter((call) => call.data === true)).toHaveLength(5);
  });

  it("uses a database compare-and-set for concurrent admin end-date changes", async () => {
    const before = await service
      .from("subscriptions")
      .select("ends_at,updated_at")
      .eq("id", "30000000-0000-4000-8000-000000000001")
      .single();
    if (before.error) throw before.error;
    const { changeEndDate, getCurrentSubscription } = await import("@/lib/subscriptions");

    const attempts = await Promise.allSettled([
      changeEndDate(FIXTURE_USER_A, "2098-01-01T00:00:00.000Z", before.data.updated_at, service as never),
      changeEndDate(FIXTURE_USER_A, "2098-02-01T00:00:00.000Z", before.data.updated_at, service as never),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await getCurrentSubscription(
      FIXTURE_USER_A,
      service as never,
      new Date(),
      "20000000-0000-4000-8000-000000000099",
    ))
      .toBeNull();

    const restored = await service
      .from("subscriptions")
      .update({ ends_at: before.data.ends_at })
      .eq("id", "30000000-0000-4000-8000-000000000001");
    expect(restored.error).toBeNull();
  });

  it("lets only one concurrent claim insert the same Telegram update", async () => {
    const updateId = Date.now();
    const calls = await Promise.all(
      Array.from({ length: 20 }, () => service
        .from("processed_telegram_updates")
        .insert({ update_id: updateId })),
    );
    expect(calls.filter((call) => call.error === null)).toHaveLength(1);
    expect(calls.filter((call) => call.error?.code === "23505")).toHaveLength(19);
    await service.from("processed_telegram_updates").delete().eq("update_id", updateId);
  });
});
