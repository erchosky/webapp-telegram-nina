import { es } from "@/lib/telegram/content/es";
import { en } from "@/lib/telegram/content/en";
import { pt } from "@/lib/telegram/content/pt";
import type { Messages } from "@/lib/telegram/content/types";

export type { Messages } from "@/lib/telegram/content/types";

export type SupportedLanguage = "es" | "en" | "pt";

const MESSAGES: Record<SupportedLanguage, Messages> = { es, en, pt };

/**
 * Map a Telegram `language_code` to a supported locale.
 * 'en' → en, 'pt' (incl. pt-br) → pt, everything else → 'es' (default).
 */
export function telegramLanguage(languageCode?: string | null): SupportedLanguage {
  const code = (languageCode ?? "").toLowerCase();
  if (code.startsWith("en")) return "en";
  if (code.startsWith("pt")) return "pt";
  return "es";
}

/** Resolve the message bundle for a given Telegram `language_code`. */
export function messagesFor(languageCode?: string | null): Messages {
  return MESSAGES[telegramLanguage(languageCode)];
}

export { es, en, pt };
