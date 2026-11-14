"use client";

import { useCallback, useState } from "react";
import { Home, MessageCircle, ShieldCheck, Store } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import { useTelegram } from "@/components/TelegramProvider";
import { AccessScreen } from "@/components/screens/AccessScreen";
import { MarketplaceScreen } from "@/components/screens/MarketplaceScreen";
import { ContactScreen } from "@/components/screens/ContactScreen";
import { JourneyScreen } from "@/components/screens/JourneyScreen";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useResource } from "@/lib/client/useResource";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { DevSandboxPanel } from "@/components/dev/DevSandboxPanel";
import { useOnlineStatus } from "@/lib/client/useOnlineStatus";
import { appConfig } from "@/lib/config/app";

type Tab = "home" | "access" | "marketplace" | "contact";

export function AppShell({ devSandbox = false }: { devSandbox?: boolean }) {
  const { ready, isTelegram, isDevMock, t, user } = useTelegram();
  const [tab, setTab] = useState<Tab>("home");
  const [devRevision, setDevRevision] = useState(0);
  const isOnline = useOnlineStatus();

  const loader = useCallback(
    (signal: AbortSignal) => {
      void devRevision;
      return apiFetch<MeDTO>("/api/me", { signal });
    },
    [devRevision],
  );
  const me = useResource(loader, t.common.genericError, {
    enabled: ready && isTelegram,
  });
  const isInitialResourceLoad = me.loading && !me.data;

  if (!ready) {
    return (
      <FullScreen>
        <LoadingState label="Cargando Telegram..." />
      </FullScreen>
    );
  }

  if (!isTelegram) {
    return (
      <FullScreen>
        <p className="px-8 text-center text-tg-hint">{t.common.notInTelegram}</p>
      </FullScreen>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: t.nav.home, icon: <Home className="h-5 w-5" /> },
    { id: "access", label: t.nav.access, icon: <ShieldCheck className="h-5 w-5" /> },
    { id: "marketplace", label: t.nav.marketplace, icon: <Store className="h-5 w-5" /> },
    { id: "contact", label: t.nav.contact, icon: <MessageCircle className="h-5 w-5" /> },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      {(devSandbox || isDevMock) && (
        <DevSandboxPanel onScenarioChange={() => setDevRevision((n) => n + 1)} />
      )}
      <header className="px-4 pb-2 pt-4">
        <p className="text-sm text-tg-hint">{t.appName}</p>
        {user?.first_name && (
          <h1 className="text-2xl font-bold">{user.first_name}</h1>
        )}
      </header>

      <main className="flex-1 px-4 pb-28">
        {!isOnline && (
          <div role="status" className="mb-3 rounded-card bg-tg-secondaryBg p-3 text-sm text-tg-hint">
            Sin conexión. Algunas acciones pueden tardar o fallar hasta que vuelva la red.
          </div>
        )}
        {isInitialResourceLoad && (
          <LoadingState label={t.common.loading} />
        )}
        {!isInitialResourceLoad && me.error && (
          <div role="status" className="mb-3 rounded-card bg-tg-secondaryBg p-3 text-sm text-tg-hint">
            No se pudo cargar tu estado VIP ahora. Puedes seguir viendo el inicio, el privado y contacto.
          </div>
        )}
        {!isInitialResourceLoad && (
          <>
            {tab === "home" && (
              <JourneyScreen
                key={`journey-${devRevision}`}
                me={me.data ?? fallbackMe(user)}
                onNavigate={setTab}
              />
            )}
            {tab === "access" && (
              me.data ? (
                <AccessScreen
                  key={`access-${devRevision}`}
                  me={me.data}
                  onHome={() => setTab("home")}
                  onContact={() => setTab("contact")}
                  onRequested={me.reload}
                />
              ) : (
                <ErrorState
                  label={me.error ?? t.common.genericError}
                  retryLabel={t.common.retry}
                  onRetry={me.reload}
                />
              )
            )}
            {tab === "marketplace" && (
              <MarketplaceScreen me={me.data} meError={me.error} onRetryMe={me.reload} />
            )}
            {tab === "contact" && <ContactScreen me={me.data ?? fallbackMe(user)} />}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-tg-bg/95 backdrop-blur">
        <div
          className="mx-auto flex w-full max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]"
          role="tablist"
          aria-label="Navegación principal"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              role="tab"
              aria-selected={tab === item.id}
              aria-label={item.label}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition",
                tab === item.id ? "text-tg-button" : "text-tg-hint",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function fallbackMe(user: ReturnType<typeof useTelegram>["user"]): MeDTO {
  return {
    language: "es",
    user: {
      firstName: user?.first_name ?? null,
      username: user?.username ?? null,
      streakMonths: 0,
    },
    subscription: null,
    group: {
      publicName: appConfig.brand.productName,
      adminContact: process.env.NEXT_PUBLIC_ADMIN_CONTACT ?? null,
      paymentInstructions: null,
      renewalText: null,
      supportText: null,
    },
    hasOpenPaymentIntent: false,
    paymentIntent: null,
  };
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">{children}</div>
  );
}
