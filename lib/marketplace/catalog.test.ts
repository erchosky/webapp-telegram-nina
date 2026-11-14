import { describe, expect, it } from "vitest";
import { isVisibleMarketplaceItem, type MarketplaceItem } from "@/lib/marketplace/catalog";

describe("isVisibleMarketplaceItem", () => {
  it("shows published available and reserved items", () => {
    expect(isVisibleMarketplaceItem(item({ status: "available" }))).toBe(true);
    expect(isVisibleMarketplaceItem(item({ status: "reserved" }))).toBe(true);
  });

  it("shows sold items only inside the configured visibility window", () => {
    const now = new Date("2026-06-30T12:00:00Z");

    expect(
      isVisibleMarketplaceItem(
        item({ status: "sold", soldVisibilityUntil: "2026-07-02T12:00:00Z" }),
        now,
      ),
    ).toBe(true);
    expect(
      isVisibleMarketplaceItem(
        item({ status: "sold", soldVisibilityUntil: "2026-06-29T12:00:00Z" }),
        now,
      ),
    ).toBe(false);
  });

  it("does not show hidden, archived, or unpublished items", () => {
    expect(isVisibleMarketplaceItem(item({ status: "hidden" }))).toBe(false);
    expect(isVisibleMarketplaceItem(item({ status: "archived" }))).toBe(false);
    expect(isVisibleMarketplaceItem(item({ isPublished: false }))).toBe(false);
  });
});

function item(partial: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: "item-1",
    title: "Producto",
    description: "Bajo consulta.",
    categoryId: "category-1",
    status: "available",
    isPublished: true,
    sortOrder: 1,
    kind: "physical_piece",
    deliveryType: "manual",
    ctaLabel: "Consultar",
    contactIntent: "consultar producto",
    ...partial,
  };
}
