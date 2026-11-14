"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  getWebApp,
  type TelegramWebAppUnsafeUser,
} from "@/lib/telegram/webapp";
import { installDevTelegramMock } from "@/lib/dev/mockTelegram";
import {
  messagesFor,
  telegramLanguage,
  type Messages,
  type SupportedLanguage,
} from "@/lib/telegram/content";

interface TelegramContextValue {
  /** True once the SDK has been initialised on the client. */
  ready: boolean;
  /** True when launched inside Telegram with usable initData. */
  isTelegram: boolean;
  /** True when development is using the local Telegram/API mock. */
  isDevMock: boolean;
  user: TelegramWebAppUnsafeUser | null;
  language: SupportedLanguage;
  t: Messages;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

export function TelegramProvider({
  children,
  devMock = false,
}: {
  children: React.ReactNode;
  devMock?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [isDevMock, setIsDevMock] = useState(false);
  const [user, setUser] = useState<TelegramWebAppUnsafeUser | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>("es");

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      const webApp = await resolveWebApp(devMock);
      if (cancelled) return;

      if (webApp?.initData) {
        webApp.ready();
        webApp.expand();
        applyTheme(webApp);
        const tgUser = webApp.initDataUnsafe.user ?? null;
        setUser(tgUser);
        setLanguage(telegramLanguage(tgUser?.language_code));
        setIsTelegram(true);
        setIsDevMock(
          process.env.NODE_ENV === "development" && webApp.initData.startsWith("dev-"),
        );
      } else {
        setIsTelegram(false);
        setIsDevMock(false);
      }

      setReady(true);
    }

    initialise();
    return () => {
      cancelled = true;
    };
  }, [devMock]);

  const value = useMemo<TelegramContextValue>(
    () => ({
      ready,
      isTelegram,
      isDevMock,
      user,
      language,
      t: messagesFor(language),
    }),
    [ready, isTelegram, isDevMock, user, language],
  );

  return (
    <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
  );
}

async function resolveWebApp(forceDevMock: boolean) {
  const existing = getWebApp();

  if (process.env.NODE_ENV === "development" && forceDevMock) {
    installDevTelegramMock();
    return getWebApp();
  }

  if (existing?.initData) {
    if (
      process.env.NODE_ENV === "development" &&
      existing.initData.startsWith("dev-")
    ) {
      return null;
    }
    return existing;
  }
  return waitForTelegramWebApp();
}

async function waitForTelegramWebApp() {
  for (let i = 0; i < 120; i++) {
    const webApp = getWebApp();
    if (webApp?.initData && !webApp.initData.startsWith("dev-")) return webApp;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const webApp = getWebApp();
  return webApp?.initData?.startsWith("dev-") ? null : webApp;
}

export function useTelegram(): TelegramContextValue {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    throw new Error("useTelegram must be used within a TelegramProvider");
  }
  return ctx;
}
