import type { MeDTO } from "@/lib/api/dto";
import type { MarketplaceCategory, MarketplaceItem } from "@/lib/marketplace/catalog";
import type { MarketplaceInterest } from "@/lib/marketplace/interest";
import { accessStatusLabel, compactLines, messageReference, type TelegramMessageUser } from "@/lib/messages/shared";

export function buildCatalogMessage({
  item,
  category,
  me,
  telegramUser,
  creatorName,
  interest,
}: {
  item: MarketplaceItem;
  category: MarketplaceCategory;
  me: MeDTO;
  telegramUser: TelegramMessageUser;
  creatorName: string;
  interest?: MarketplaceInterest;
}): string {
  const reference = messageReference(me, telegramUser);
  const hasActiveAccess = me.subscription?.status === "active";
  return compactLines([
    `Hola ${creatorName}, me interesa esto de tu catálogo privado.`,
    "",
    `Producto: ${item.title}`,
    `Categoría: ${category.title}`,
    item.priceLabel ? `Precio mostrado: ${item.priceLabel}` : null,
    interest ? `Referencia de interés: ${interest.source}:${interest.itemId}` : null,
    reference.username ? `Usuario: ${reference.username}` : null,
    reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : null,
    `Estado de acceso: ${accessStatusLabel(me)}`,
    item.requiresActiveAccess && !hasActiveAccess ? "Nota: ahora mismo no tengo acceso activo." : null,
    "",
    "¿Está disponible y cómo seguimos?",
  ]);
}
