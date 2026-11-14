import type { MeDTO } from "@/lib/api/dto";
import { compactLines, messageReference, type TelegramMessageUser } from "@/lib/messages/shared";

export type SupportIntent = "access" | "catalog" | "invite" | "general";

export function buildSupportMessage({
  intent,
  me,
  telegramUser,
  creatorName,
}: {
  intent: SupportIntent;
  me: MeDTO;
  telegramUser: TelegramMessageUser;
  creatorName: string;
}): string {
  const reference = messageReference(me, telegramUser);
  if (intent === "access") {
    return compactLines([
      `Hola ${creatorName}, quiero entrar o renovar mi acceso VIP.`,
      "",
      "Plan elegido:",
      reference.username ? `Usuario: ${reference.username}` : "Usuario:",
      reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
      "",
      "Dime cómo seguimos y te paso el pago donde corresponda.",
    ]);
  }
  if (intent === "catalog") {
    return compactLines([
      `Hola ${creatorName}, me interesa algo de tu catálogo privado.`,
      "",
      "Producto o categoría:",
      reference.username ? `Usuario: ${reference.username}` : "Usuario:",
      reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
      "",
      "¿Está disponible?",
    ]);
  }
  if (intent === "invite") {
    return compactLines([
      `Hola ${creatorName}, tengo un problema con mi enlace de acceso al VIP.`,
      "",
      "Estado que me aparece:",
      reference.username ? `Usuario: ${reference.username}` : "Usuario:",
      reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
      "",
      "¿Me lo puedes revisar cuando puedas?",
    ]);
  }
  return compactLines([
    `Hola ${creatorName}, necesito comentarte una cosa.`,
    "",
    "Te cuento:",
    reference.username ? `Usuario: ${reference.username}` : "Usuario:",
    reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
  ]);
}
