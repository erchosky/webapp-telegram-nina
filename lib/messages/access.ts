import type { MeDTO } from "@/lib/api/dto";
import { planById } from "@/lib/miniapp/plans";
import { compactLines, messageReference, type TelegramMessageUser } from "@/lib/messages/shared";

export function buildAccessMessage({
  me,
  telegramUser,
  selectedPlanId,
  creatorName,
}: {
  me: MeDTO;
  telegramUser: TelegramMessageUser;
  selectedPlanId: string | null;
  creatorName: string;
}): string {
  const reference = messageReference(me, telegramUser);
  const plan = planById(selectedPlanId);
  const activeOrExpired = me.subscription?.status === "active" || me.subscription?.status === "expired";
  return compactLines([
    `Hola ${creatorName}, quiero ${activeOrExpired ? "renovar mi acceso VIP" : "entrar a tu VIP"}.`,
    "",
    plan ? `Plan elegido: ${plan.name} (${plan.displayPrice}, ${plan.durationLabel}).` : "Plan elegido:",
    reference.username ? `Usuario: ${reference.username}` : "Usuario:",
    reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
    "",
    "Dime cómo seguimos y te paso el pago donde corresponda.",
  ]);
}
