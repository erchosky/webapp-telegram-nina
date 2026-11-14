import { describe, expect, it } from "vitest";
import {
  buildMarketplaceInterest,
  buildMarketplaceInterestRequest,
} from "@/lib/marketplace/interest";
import type { MeDTO } from "@/lib/api/dto";
import type { MarketplaceCategory, MarketplaceItem } from "@/lib/marketplace/catalog";

describe("buildMarketplaceInterest", () => {
  it("creates a manual-first marketplace interest without payment data", () => {
    const item: MarketplaceItem = {
      id: "piece-1",
      title: "Pieza puntual",
      description: "Consulta manual.",
      categoryId: "pieces",
      priceLabel: "consultar",
      status: "available",
      isPublished: true,
      sortOrder: 1,
      kind: "physical_piece",
      deliveryType: "manual",
      requiresActiveAccess: true,
      ctaLabel: "Me interesa",
      contactIntent: "preguntar por pieza",
    };
    const category: MarketplaceCategory = {
      id: "pieces",
      title: "Piezas",
      description: "Piezas disponibles.",
    };

    expect(buildMarketplaceInterest({ item, category, me: fixtureMe() })).toEqual({
      source: "miniapp_marketplace",
      itemId: "piece-1",
      categoryId: "pieces",
      title: "Pieza puntual",
      priceLabel: "consultar",
      status: "available",
      requiresActiveAccess: true,
      telegramUsername: "creator_user",
    });
  });

  it("builds the exact strict HTTP payload without client-controlled metadata", () => {
    expect(buildMarketplaceInterestRequest("piece-1", "Me interesa")).toEqual({
      itemId: "piece-1",
      message: "Me interesa",
    });
  });
});

function fixtureMe(): MeDTO {
  return {
    language: "es",
    user: { firstName: "Creator", username: "creator_user", streakMonths: 0 },
    subscription: null,
    group: null,
    hasOpenPaymentIntent: false,
    paymentIntent: null,
  };
}
