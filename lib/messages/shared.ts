import type { MeDTO } from "@/lib/api/dto";

export type TelegramMessageUser = { id?: number; username?: string } | null;

export interface MessageReference {
  username: string | null;
  telegramId: string | null;
}

export function messageReference(
  me: MeDTO,
  telegramUser: TelegramMessageUser,
): MessageReference {
  const username = telegramUser?.username ?? me.user.username;
  const id = telegramUser?.id;
  return {
    username: username ? `@${username}` : null,
    telegramId: typeof id === "number" ? `ID ${id}` : null,
  };
}

export function accessStatusLabel(me: MeDTO): string {
  if (me.subscription?.status === "active") return "acceso activo";
  if (me.subscription?.status === "expired") return "acceso caducado";
  if (me.subscription?.status === "needs_manual_review") return "acceso en revisión";
  if (me.subscription?.status === "pending") return "acceso pendiente";
  return "sin acceso activo";
}

export function compactLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => line !== null && line !== undefined).join("\n");
}
