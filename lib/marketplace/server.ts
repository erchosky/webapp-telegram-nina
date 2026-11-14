import "server-only";
import { ServiceError } from "@/lib/api/respond";
import {
  buildMarketplaceCatalog,
  CODE_FIXTURES_ENABLED,
  DEFAULT_MARKETPLACE_SETTINGS,
  emptyMarketplaceCatalog,
  fixtureMarketplaceCatalog,
  type MarketplaceCatalog,
  type MarketplaceCategory,
  type MarketplaceDeliveryType,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplacePlan,
  type MarketplaceSettings,
} from "@/lib/marketplace/catalog";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { withTimeout } from "@/lib/util/timeout";

const PUBLIC_CATALOG_TIMEOUT_MS = 8_000;

type SettingRow = {
  key: string;
  value: Record<string, unknown> | null;
};

type CategoryRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  status: string | null;
  sort_order: number | null;
};

type ItemRow = {
  id: string;
  creator_id: string | null;
  category_id: string | null;
  status: string | null;
  title: string;
  description: string | null;
  visible_terms: string | null;
  price: number | string | null;
  currency: string | null;
  price_label: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
  sold_at: string | null;
  sold_visibility_until: string | null;
  published_at: string | null;
  public_visible: boolean | null;
  kind: MarketplaceKind | null;
  delivery_type: MarketplaceDeliveryType | null;
  requires_active_access: boolean | null;
  cta_label: string | null;
  contact_intent: string | null;
};

type ImageRow = {
  item_id: string;
  public_url: string | null;
  storage_path: string | null;
  alt_text: string | null;
  sort_order: number | null;
  is_primary: boolean | null;
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  amount: number | string | null;
  currency: string | null;
  duration_days: number | null;
  is_featured: boolean | null;
  sort_order: number | null;
};

export async function getPublicMarketplaceCatalog(): Promise<MarketplaceCatalog> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (CODE_FIXTURES_ENABLED) return fixtureMarketplaceCatalog();
    return emptyMarketplaceCatalog();
  }

  const supabase = createAdminClient();
  return withTimeout(loadPublicMarketplaceCatalog(supabase), PUBLIC_CATALOG_TIMEOUT_MS, "marketplace");
}

async function loadPublicMarketplaceCatalog(
  supabase: AdminClient,
): Promise<MarketplaceCatalog> {
  const [settingsResult, categoriesResult, itemsResult, plansResult] =
    await Promise.all([
      supabase
        .from("webapp_settings")
        .select("key, value")
        .eq("is_public", true)
        .in("key", ["branding", "marketplace", "home"])
        .limit(20),
      supabase
        .from("marketplace_categories")
        .select("id, slug, title, description, image_url, status, sort_order")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(100),
      supabase
        .from("marketplace_items")
        .select(
          "id, creator_id, category_id, status, title, description, visible_terms, price, currency, price_label, " +
            "is_featured, sort_order, sold_at, sold_visibility_until, published_at, public_visible, " +
            "kind, delivery_type, requires_active_access, cta_label, contact_intent",
        )
        .neq("status", "hidden")
        .neq("status", "archived")
        .eq("public_visible", true)
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(200),
      supabase
        .from("vip_plans")
        .select("id, name, description, amount, currency, duration_days, is_featured, sort_order")
        .eq("status", "published")
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(50),
    ]);

  for (const [service, result] of [
    ["settings", settingsResult],
    ["categories", categoriesResult],
    ["items", itemsResult],
    ["plans", plansResult],
  ] as const) {
    if (result.error) {
      throw new ServiceError(500, "db_error", result.error.message, {
        context: { service: `marketplace.public.${service}` },
      });
    }
  }

  const settings = settingsFromRows(((settingsResult.data ?? []) as unknown) as SettingRow[]);
  const categories = (((categoriesResult.data ?? []) as unknown) as CategoryRow[]).map(mapCategory);
  const publishedCategoryIds = new Set(categories.map((category) => category.id));
  const itemRows = ((itemsResult.data ?? []) as unknown) as ItemRow[];
  const itemIds = itemRows.map((item) => item.id);
  // Avoid transferring unrelated assets when the catalog is small compared to
  // the full marketplace. The existing item_id index supports this lookup.
  const imagesResult = itemIds.length > 0
    ? await supabase
        .from("marketplace_item_images")
        .select("item_id, public_url, storage_path, alt_text, is_primary, sort_order")
        .in("item_id", itemIds)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(500)
    : { data: [], error: null };
  if (imagesResult.error) {
    throw new ServiceError(500, "db_error", imagesResult.error.message, {
      context: { service: "marketplace.public.images" },
    });
  }
  const imagesByItem = primaryImages(((imagesResult.data ?? []) as unknown) as ImageRow[]);
  const plans = (((plansResult.data ?? []) as unknown) as PlanRow[]).map(mapPlan);
  const items = itemRows
    .map((row) => mapItem(row, imagesByItem.get(row.id)))
    .filter((item) => item.categoryId !== "" && publishedCategoryIds.has(item.categoryId));

  return buildMarketplaceCatalog(categories, items, settings, "supabase", new Date(), plans);
}

function settingsFromRows(rows: SettingRow[]): MarketplaceSettings {
  const merged = rows.reduce<Record<string, unknown>>((acc, row) => {
    if (row.value && typeof row.value === "object") Object.assign(acc, row.value);
    return acc;
  }, {});

  return {
    creatorName: stringValue(merged.creatorName, DEFAULT_MARKETPLACE_SETTINGS.creatorName),
    headline: stringValue(merged.marketplaceHeadline, DEFAULT_MARKETPLACE_SETTINGS.headline),
    intro: stringValue(merged.marketplaceIntro, DEFAULT_MARKETPLACE_SETTINGS.intro),
    emptyTitle: stringValue(merged.marketplaceEmptyTitle, DEFAULT_MARKETPLACE_SETTINGS.emptyTitle),
    emptyBody: stringValue(merged.marketplaceEmptyBody, DEFAULT_MARKETPLACE_SETTINGS.emptyBody),
    headerImageUrl: optionalHttpUrl(merged.marketplaceHeaderImageUrl),
    logoImageUrl: optionalHttpUrl(merged.logoImageUrl),
    availableLabel: stringValue(merged.marketplaceAvailableLabel, DEFAULT_MARKETPLACE_SETTINGS.availableLabel),
    reservedLabel: stringValue(merged.marketplaceReservedLabel, DEFAULT_MARKETPLACE_SETTINGS.reservedLabel),
    soldLabel: stringValue(merged.marketplaceSoldLabel, DEFAULT_MARKETPLACE_SETTINGS.soldLabel),
  };
}

function mapCategory(row: CategoryRow): MarketplaceCategory {
  return {
    id: row.id,
    slug: row.slug ?? undefined,
    title: row.title,
    description: row.description ?? "",
    imageUrl: row.image_url ?? undefined,
    status: "published",
    sortOrder: row.sort_order ?? 100,
  };
}

function mapItem(row: ItemRow, image?: ImageRow): MarketplaceItem {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description ?? "",
    visibleTerms: row.visible_terms ?? undefined,
    categoryId: row.category_id ?? "",
    imageUrl: imageUrl(image),
    imageAlt: image?.alt_text ?? undefined,
    priceAmount: numberValue(row.price),
    currency: row.currency === "EUR" ? "EUR" : undefined,
    priceLabel: row.price_label ?? priceLabel(row.price, row.currency),
    status: row.status === "reserved" || row.status === "sold" ? row.status : "available",
    isPublished: row.public_visible !== false && row.status !== "hidden" && row.status !== "archived",
    soldAt: row.sold_at,
    soldVisibilityUntil: row.sold_visibility_until,
    isFeatured: row.is_featured === true,
    sortOrder: row.sort_order ?? 100,
    kind: row.kind ?? "physical_piece",
    deliveryType: row.delivery_type ?? "manual",
    requiresActiveAccess: row.requires_active_access === true,
    ctaLabel: row.cta_label ?? "Me interesa",
    contactIntent: row.contact_intent ?? `consultar ${row.title}`,
  };
}

function mapPlan(row: PlanRow): MarketplacePlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    amount: numberValue(row.amount) ?? null,
    currency: row.currency ?? "EUR",
    durationDays: row.duration_days,
    isFeatured: row.is_featured === true,
    sortOrder: row.sort_order ?? 100,
  };
}

function primaryImages(rows: ImageRow[]): Map<string, ImageRow> {
  const map = new Map<string, ImageRow>();
  for (const row of rows) {
    if (!map.has(row.item_id)) map.set(row.item_id, row);
  }
  return map;
}

function imageUrl(image: ImageRow | undefined): string | undefined {
  if (!image) return undefined;
  if (image.public_url) return image.public_url;
  if (!image.storage_path) return undefined;
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl}/storage/v1/object/public/creator-assets/${image.storage_path}`;
}

function priceLabel(price: ItemRow["price"], currency: string | null): string | undefined {
  const amount = numberValue(price);
  if (amount === undefined) return undefined;
  return `${amount.toLocaleString("es-ES")} ${currency ?? "EUR"}`;
}

function numberValue(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
