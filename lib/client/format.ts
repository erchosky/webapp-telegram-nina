import type { SupportedLanguage } from "@/lib/telegram/content";

const LOCALES: Record<SupportedLanguage, string> = {
  es: "es-ES",
  en: "en-US",
  pt: "pt-PT",
};

/** Format an ISO date as a localized day (e.g. "26 jun 2026"), or null. */
export function formatDate(iso: string | null, language: SupportedLanguage): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  iso: string | null,
  language: SupportedLanguage,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
