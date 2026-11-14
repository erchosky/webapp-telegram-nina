import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TelegramProvider } from "@/components/TelegramProvider";
import { telegramEnv } from "@/lib/env";
import { signInitData } from "@/lib/telegram/initData";

export const dynamic = "force-dynamic";

type HarnessUser = "member" | "other" | "no-access";
type HarnessCredential = "valid" | "tampered" | "expired";

const HARNESS_USERS = {
  member: {
    id: 700000001,
    first_name: "Ángela",
    username: "fixture_member",
    language_code: "es",
  },
  other: {
    id: 700000002,
    first_name: "Bruno",
    username: "fixture_other",
    language_code: "pt",
  },
  "no-access": {
    id: 700000003,
    first_name: "No Access",
    username: "fixture_no_access",
    language_code: "en",
  },
} as const;

export default async function TelegramTestHarness({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; credential?: string }>;
}) {
  if (process.env.E2E_TEST_MODE !== "1") notFound();

  const params = await searchParams;
  const userKey = harnessUser(params.user);
  const credential = harnessCredential(params.credential);
  const user = HARNESS_USERS[userKey];
  const now = Math.floor(Date.now() / 1000);
  let initData = signInitData(
    {
      auth_date: String(credential === "expired" ? now - 7_201 : now),
      query_id: `e2e-query-${user.id}`,
      user: JSON.stringify(user),
      start_param: "e2e_harness",
    },
    telegramEnv().TELEGRAM_BOT_TOKEN,
  );
  if (credential === "tampered") {
    const parsed = new URLSearchParams(initData);
    const hash = parsed.get("hash") ?? "";
    parsed.set("hash", `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`);
    initData = parsed.toString();
  }

  return (
    <>
      <script
        data-testid="telegram-e2e-bootstrap"
        dangerouslySetInnerHTML={{ __html: telegramBootstrapScript(initData, user) }}
      />
      <TelegramProvider>
        <AppShell />
      </TelegramProvider>
    </>
  );
}

function harnessUser(value: string | undefined): HarnessUser {
  return value === "other" || value === "no-access" ? value : "member";
}

function harnessCredential(value: string | undefined): HarnessCredential {
  return value === "tampered" || value === "expired" ? value : "valid";
}

function telegramBootstrapScript(
  initData: string,
  user: (typeof HARNESS_USERS)[HarnessUser],
): string {
  const payload = JSON.stringify({ initData, user }).replaceAll("<", "\\u003c");
  return `
    (() => {
      const fixture = ${payload};
      const events = [];
      window.__telegramHarness = { events };
      window.Telegram = { WebApp: {
        initData: fixture.initData,
        initDataUnsafe: { user: fixture.user, start_param: "e2e_harness" },
        colorScheme: "light",
        themeParams: {
          bg_color: "#ffffff",
          secondary_bg_color: "#f4f4f5",
          text_color: "#0f0f0f",
          hint_color: "#707579",
          link_color: "#2481cc",
          button_color: "#2481cc",
          button_text_color: "#ffffff",
          destructive_text_color: "#df3f40"
        },
        isExpanded: true,
        ready: () => events.push({ type: "ready" }),
        expand: () => events.push({ type: "expand" }),
        close: () => events.push({ type: "close" }),
        openTelegramLink: (url) => events.push({ type: "openTelegramLink", url }),
        openLink: (url) => events.push({ type: "openLink", url }),
        HapticFeedback: {
          impactOccurred: (style) => events.push({ type: "impact", style }),
          notificationOccurred: (notificationType) => events.push({ type: "notification", notificationType })
        }
      } };
    })();
  `;
}
