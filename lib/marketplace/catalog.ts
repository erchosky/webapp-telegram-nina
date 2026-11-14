export type MarketplaceItemStatus = "available" | "reserved" | "sold" | "hidden" | "archived";
export type MarketplaceKind =
  | "online_content"
  | "custom_request"
  | "physical_piece"
  | "wishlist"
  | "promotion";
export type MarketplaceDeliveryType = "telegram" | "manual" | "external";

export interface MarketplaceCategory {
  id: string;
  slug?: string;
  title: string;
  description: string;
  imageUrl?: string;
  status?: "draft" | "published" | "hidden" | "archived";
  sortOrder?: number;
}

export interface MarketplaceItem {
  id: string;
  creatorId?: string | null;
  title: string;
  description: string;
  visibleTerms?: string;
  categoryId: string;
  imageUrl?: string;
  imageAlt?: string;
  priceAmount?: number;
  currency?: "EUR";
  priceLabel?: string;
  status: MarketplaceItemStatus;
  isPublished: boolean;
  soldAt?: string | null;
  soldVisibilityUntil?: string | null;
  isFeatured?: boolean;
  sortOrder: number;
  kind: MarketplaceKind;
  deliveryType: MarketplaceDeliveryType;
  requiresActiveAccess?: boolean;
  ctaLabel: string;
  contactIntent: string;
}

export interface MarketplaceSettings {
  creatorName: string;
  headline: string;
  intro: string;
  emptyTitle: string;
  emptyBody: string;
  headerImageUrl?: string;
  logoImageUrl?: string;
  availableLabel: string;
  reservedLabel: string;
  soldLabel: string;
}

export interface MarketplacePlan {
  id: string;
  name: string;
  description: string;
  amount: number | null;
  currency: string;
  durationDays: number | null;
  isFeatured: boolean;
  sortOrder: number;
}

export interface MarketplaceCatalog {
  categories: MarketplaceCategory[];
  items: MarketplaceItem[];
  visibleCategories: MarketplaceCategory[];
  visibleItems: MarketplaceItem[];
  plans: MarketplacePlan[];
  settings: MarketplaceSettings;
  source: "supabase" | "fixtures" | "empty";
}

export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettings = {
  creatorName: process.env.NEXT_PUBLIC_CREATOR_NAME || "Nina",
  headline: "Privado disponible",
  intro:
    "Mira contenido, piezas puntuales o solicitudes bajo consulta. Todo se confirma por privado.",
  emptyTitle: "No hay nada visible ahora",
  emptyBody: "Ahora no hay piezas visibles. Escríbeme por privado y te digo qué hay disponible.",
  availableLabel: "Bajo consulta",
  reservedLabel: "Reservado",
  soldLabel: "Vendido",
};

export const CODE_FIXTURES_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES === "true" &&
  process.env.NODE_ENV !== "production";

export const MARKETPLACE_FIXTURE_CATEGORIES: MarketplaceCategory[] = [
  {
    id: "online-content",
    title: "Contenido online",
    description: "Packs, vídeos o contenido privado disponible bajo consulta.",
  },
  {
    id: "custom",
    title: "Personalizados",
    description: "Ideas a medida, siempre bajo acuerdo previo.",
  },
  {
    id: "pieces",
    title: "Piezas bajo consulta",
    description: "Piezas puntuales solo cuando Nina confirma disponibilidad.",
  },
  {
    id: "wishlist-gifts",
    title: "Wishlist / regalos",
    description: "Wishlist o regalos disponibles por privado.",
  },
];

export const MARKETPLACE_FIXTURE_ITEMS: MarketplaceItem[] = [
  {
    id: "online-drop",
    title: "Contenido online bajo consulta",
    description: "Packs, vídeos o contenido privado disponible. Se confirma por privado.",
    categoryId: "online-content",
    priceLabel: "consultar",
    status: "available",
    isPublished: true,
    sortOrder: 10,
    kind: "online_content",
    deliveryType: "telegram",
    requiresActiveAccess: true,
    ctaLabel: "Consultar contenido",
    contactIntent: "consultar el contenido online disponible",
  },
  {
    id: "custom-pack",
    title: "Pack personalizado",
    description: "Cuéntame la idea. Si encaja, se prepara bajo acuerdo previo.",
    categoryId: "custom",
    priceAmount: 45,
    currency: "EUR",
    priceLabel: "desde 45 €",
    status: "available",
    isPublished: true,
    sortOrder: 20,
    kind: "custom_request",
    deliveryType: "manual",
    ctaLabel: "Pedir personalizado",
    contactIntent: "pedir información sobre un pack personalizado",
  },
  {
    id: "wishlist",
    title: "Wishlist / regalos",
    description: "Pregunta si hay wishlist o regalos disponibles ahora.",
    categoryId: "wishlist-gifts",
    priceLabel: "consultar",
    status: "available",
    isPublished: true,
    sortOrder: 50,
    kind: "wishlist",
    deliveryType: "manual",
    ctaLabel: "Preguntar por wishlist",
    contactIntent: "preguntar por wishlist o regalos",
  },
  {
    id: "spiderman-socks",
    title: "Calcetines Spider-Man",
    description: "Pieza puntual. Estado y disponibilidad se confirman por privado.",
    categoryId: "pieces",
    imageUrl: "/marketplace/spiderman-socks.jpg",
    imageAlt: "Calcetines Spider-Man",
    priceAmount: 25,
    currency: "EUR",
    priceLabel: "25 €",
    status: "hidden",
    isPublished: false,
    sortOrder: 30,
    kind: "physical_piece",
    deliveryType: "manual",
    ctaLabel: "Preguntar por esta pieza",
    contactIntent: "preguntar por los Calcetines Spider-Man",
  },
  {
    id: "new-balance-shoes",
    title: "Zapatillas New Balance",
    description: "Pieza puntual. Talla, estado y disponibilidad se confirman por privado.",
    categoryId: "pieces",
    imageUrl: "/marketplace/new-balance.jpg",
    imageAlt: "Zapatillas New Balance",
    priceLabel: "consultar",
    status: "hidden",
    isPublished: false,
    sortOrder: 40,
    kind: "physical_piece",
    deliveryType: "manual",
    ctaLabel: "Preguntar por esta pieza",
    contactIntent: "preguntar por las Zapatillas New Balance",
  },
];

export function buildMarketplaceCatalog(
  categories: MarketplaceCategory[],
  items: MarketplaceItem[],
  settings: MarketplaceSettings = DEFAULT_MARKETPLACE_SETTINGS,
  source: MarketplaceCatalog["source"] = "supabase",
  now: Date = new Date(),
  plans: MarketplacePlan[] = [],
): MarketplaceCatalog {
  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleItems = sortedItems.filter((item) => isVisibleMarketplaceItem(item, now));
  const sortedCategories = [...categories].sort(
    (a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100),
  );
  const visibleCategories = sortedCategories.filter((category) =>
    visibleItems.some((item) => item.categoryId === category.id),
  );
  return {
    categories: sortedCategories,
    items: sortedItems,
    visibleCategories,
    visibleItems,
    plans: [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    settings,
    source: visibleItems.length > 0 || sortedCategories.length > 0 ? source : "empty",
  };
}

export function fixtureMarketplaceCatalog(): MarketplaceCatalog {
  return buildMarketplaceCatalog(
    MARKETPLACE_FIXTURE_CATEGORIES,
    MARKETPLACE_FIXTURE_ITEMS,
    DEFAULT_MARKETPLACE_SETTINGS,
    "fixtures",
  );
}

export function emptyMarketplaceCatalog(
  settings: MarketplaceSettings = DEFAULT_MARKETPLACE_SETTINGS,
): MarketplaceCatalog {
  return buildMarketplaceCatalog([], [], settings, "empty");
}

export function categoryById(
  catalog: Pick<MarketplaceCatalog, "categories">,
  categoryId: string,
): MarketplaceCategory | null {
  return catalog.categories.find((category) => category.id === categoryId) ?? null;
}

export function isVisibleMarketplaceItem(
  item: MarketplaceItem,
  now: Date = new Date(),
): boolean {
  if (!item.isPublished) return false;
  if (item.status === "available" || item.status === "reserved") return true;
  if (item.status !== "sold") return false;
  if (!item.soldVisibilityUntil) return false;
  const until = new Date(item.soldVisibilityUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}
