"use client";

import type { TelegramWebApp } from "@/lib/telegram/webapp";
import { DEV_SCENARIOS, type DevScenario } from "@/lib/dev/mockData";

const ACTIVE_KEY = "webapptelegram.dev.active";
const SCENARIO_KEY = "webapptelegram.dev.scenario";
const EVENT = "webapptelegram:dev-scenario-change";

export function installDevTelegramMock(): void {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, "1");
  const user = {
    id: 424242,
    first_name: "Dev",
    username: "creator_dev",
    language_code: "es",
  };

  const webApp: TelegramWebApp = {
    initData: "dev-init-data-mocked-by-local-sandbox",
    initDataUnsafe: { user, start_param: "dev_sandbox" },
    colorScheme: "light",
    themeParams: {
      bg_color: "#ffffff",
      secondary_bg_color: "#f4f4f5",
      text_color: "#0f0f0f",
      hint_color: "#707579",
      link_color: "#2481cc",
      button_color: "#2481cc",
      button_text_color: "#ffffff",
      destructive_text_color: "#df3f40",
    },
    isExpanded: true,
    ready: () => undefined,
    expand: () => undefined,
    close: () => undefined,
    openTelegramLink: (url) => console.info("[miniapp dev] openTelegramLink", url),
    openLink: (url) => console.info("[miniapp dev] openLink", url),
    HapticFeedback: {
      impactOccurred: () => undefined,
      notificationOccurred: () => undefined,
    },
  };
  window.Telegram = { WebApp: webApp };
}

export function isDevMockActive(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    localStorage.getItem(ACTIVE_KEY) === "1" &&
    window.Telegram?.WebApp?.initData?.startsWith("dev-") === true
  );
}

export function getDevScenario(): DevScenario {
  if (typeof window === "undefined") return "onboarding";
  const value = localStorage.getItem(SCENARIO_KEY) as DevScenario | null;
  if (value && DEV_SCENARIOS.some((item) => item.id === value)) return value;
  return "onboarding";
}

export function setDevScenario(scenario: DevScenario): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCENARIO_KEY, scenario);
  installDevTelegramMock();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: scenario }));
}

export function onDevScenarioChange(callback: (scenario: DevScenario) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<DevScenario>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
