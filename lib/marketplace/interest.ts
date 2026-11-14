import type { MeDTO } from "@/lib/api/dto";
import type { MarketplaceCategory, MarketplaceItem } from "@/lib/marketplace/catalog";

export interface MarketplaceInterest {
  source: "miniapp_marketplace";
  itemId: string;
  categoryId: string;
  title: string;
  priceLabel: string | null;
  status: MarketplaceItem["status"];
  requiresActiveAccess: boolean;
  telegramUsername: string | null;
}

export function buildMarketplaceInterestRequest(itemId: string, message: string) {
  return { itemId, message };
}

export function buildMarketplaceInterest({
  item,
  category,
  me,
}: {
  item: MarketplaceItem;
  category: MarketplaceCategory;
  me: MeDTO;
}): MarketplaceInterest {
  return {
    source: "miniapp_marketplace",
    itemId: item.id,
    categoryId: category.id,
    title: item.title,
    priceLabel: item.priceLabel ?? null,
    status: item.status,
    requiresActiveAccess: item.requiresActiveAccess === true,
    telegramUsername: me.user.username,
  };
}
