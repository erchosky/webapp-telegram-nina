import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getPublicMarketplaceCatalog } from "@/lib/marketplace/server";

function queryResult(data: unknown[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
}

describe("public marketplace catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("oculta items cuya categoría no está publicada en el catálogo público", async () => {
    const images = queryResult([]);
    const db = {
      from(table: string) {
        if (table === "webapp_settings") return queryResult([]);
        if (table === "marketplace_categories") {
          return queryResult([
            { id: "published-category", slug: "publica", title: "Visible", description: null, status: "published", sort_order: 1 },
          ]);
        }
        if (table === "marketplace_items") {
          return queryResult([
            {
              id: "item-visible",
              creator_id: null,
              category_id: "published-category",
              status: "available",
              title: "Visible",
              description: null,
              price: null,
              currency: "EUR",
              price_label: null,
              is_featured: false,
              sort_order: 1,
              sold_at: null,
              sold_visibility_until: null,
              published_at: null,
              public_visible: true,
              kind: "physical_piece",
              delivery_type: "manual",
              requires_active_access: false,
              cta_label: "Me interesa",
              contact_intent: null,
            },
            {
              id: "item-hidden-category",
              creator_id: null,
              category_id: "hidden-category",
              status: "available",
              title: "No debe salir",
              description: null,
              price: null,
              currency: "EUR",
              price_label: null,
              is_featured: false,
              sort_order: 2,
              sold_at: null,
              sold_visibility_until: null,
              published_at: null,
              public_visible: true,
              kind: "physical_piece",
              delivery_type: "manual",
              requires_active_access: false,
              cta_label: "Me interesa",
              contact_intent: null,
            },
          ]);
        }
        if (table === "marketplace_item_images") return images;
        if (table === "vip_plans") return queryResult([]);
        throw new Error(`Unexpected table ${table}`);
      },
    };
    mocks.createAdminClient.mockReturnValue(db);

    const catalog = await getPublicMarketplaceCatalog();

    expect(catalog.visibleItems.map((item) => item.id)).toEqual(["item-visible"]);
    expect(images.in).toHaveBeenCalledWith("item_id", ["item-visible", "item-hidden-category"]);
  });
});
