/**
 * Minimal typings + accessors for the Telegram WebApp client object
 * (`window.Telegram.WebApp`). Client-safe (no secrets, no server imports).
 * The full SDK is loaded via the official telegram-web-app.js script.
 */

export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  destructive_text_color?: string;
}

export interface TelegramWebAppUnsafeUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUnsafeUser;
    start_param?: string;
  };
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** The raw signed initData string to send to the server, or "" if unavailable. */
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

/** Apply Telegram theme params as CSS variables so Tailwind tokens pick them up. */
export function applyTheme(webApp: TelegramWebApp): void {
  const root = document.documentElement;
  const params = webApp.themeParams ?? {};
  const map: Record<string, string | undefined> = {
    "--tg-theme-bg-color": params.bg_color,
    "--tg-theme-secondary-bg-color": params.secondary_bg_color,
    "--tg-theme-text-color": params.text_color,
    "--tg-theme-hint-color": params.hint_color,
    "--tg-theme-link-color": params.link_color,
    "--tg-theme-button-color": params.button_color,
    "--tg-theme-button-text-color": params.button_text_color,
    "--tg-theme-destructive-text-color": params.destructive_text_color,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value) root.style.setProperty(key, value);
  }
  root.dataset.colorScheme = webApp.colorScheme;
}
