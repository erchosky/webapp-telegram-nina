import type { MeDTO } from "@/lib/api/dto";
import { compactLines, messageReference, type TelegramMessageUser } from "@/lib/messages/shared";

export function buildInviteProblemMessage({
  me,
  telegramUser,
  creatorName,
  stateLabel,
}: {
  me: MeDTO;
  telegramUser: TelegramMessageUser;
  creatorName: string;
  stateLabel?: string | null;
}): string {
  const reference = messageReference(me, telegramUser);
  return compactLines([
    `Hola ${creatorName}, tengo un problema con mi enlace de acceso al VIP.`,
    "",
    stateLabel ? `Estado que me aparece: ${stateLabel}` : "Estado que me aparece:",
    reference.username ? `Usuario: ${reference.username}` : "Usuario:",
    reference.telegramId ? `Referencia Telegram: ${reference.telegramId}` : "Referencia Telegram:",
    "",
    "¿Me lo puedes revisar cuando puedas?",
  ]);
}
