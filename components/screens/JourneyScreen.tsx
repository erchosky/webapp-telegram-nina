"use client";

import { CreditCard, HelpCircle, MessageCircle, Search, ShieldCheck, Store } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { useTelegram } from "@/components/TelegramProvider";
import { appConfig } from "@/lib/config/app";
import { getAccessState } from "@/lib/client/subscriptionState";

type MainTab = "home" | "access" | "marketplace" | "contact";

export function JourneyScreen({
  me,
  onNavigate,
}: {
  me: MeDTO;
  onNavigate: (tab: MainTab) => void;
}) {
  const { user } = useTelegram();
  const status = accessSummary(me);
  const primary = primaryAction(me);
  const firstName = me.user.firstName ?? user?.first_name ?? null;
  const actions = homeActions(onNavigate);

  function runPrimary() {
    onNavigate(primary.target);
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-tg-hint">
            {firstName ? `Hola, ${firstName}` : "Hola"}
          </p>
          <h1 className="text-3xl font-bold leading-tight">
            Tu {appConfig.brand.productName.toLowerCase()} con {appConfig.brand.creatorName}.
          </h1>
          <p className="text-sm leading-relaxed text-tg-hint">
            Revisa tu acceso, mira lo que está disponible y escríbeme con el mensaje preparado, sin vueltas.
          </p>
        </div>

        <div className="rounded-card bg-tg-secondaryBg p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{status.title}</CardTitle>
              <p className="mt-1 text-sm leading-relaxed text-tg-hint">{status.body}</p>
            </div>
            <span className="shrink-0 rounded-full bg-tg-bg px-2.5 py-1 text-xs font-semibold text-tg-button ring-1 ring-black/5">
              {status.badge}
            </span>
          </div>
        </div>

        <Button onClick={runPrimary}>
          {primary.icon}
          {primary.label}
        </Button>
      </Card>

      <Card className="space-y-3">
        <CardTitle>¿Qué quieres hacer ahora?</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <QuickAction
              key={action.label}
              label={action.label}
              icon={action.icon}
              onClick={action.onClick}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function homeActions(onNavigate: (tab: MainTab) => void) {
  return [
    {
      label: "Entrar o renovar",
      icon: <CreditCard className="h-5 w-5" />,
      onClick: () => onNavigate("access"),
    },
    {
      label: "Privado disponible",
      icon: <Store className="h-5 w-5" />,
      onClick: () => onNavigate("marketplace"),
    },
    {
      label: "Preguntar por algo",
      icon: <Search className="h-5 w-5" />,
      onClick: () => onNavigate("marketplace"),
    },
    {
      label: "Necesito ayuda",
      icon: <HelpCircle className="h-5 w-5" />,
      onClick: () => onNavigate("contact"),
    },
  ];
}

function QuickAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-card bg-tg-bg p-2 text-center text-xs font-semibold shadow-sm ring-1 ring-black/10 transition active:scale-[0.99]"
    >
      <span className="text-tg-button">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function primaryAction(me: MeDTO): {
  label: string;
  target: MainTab;
  icon: React.ReactNode;
} {
  if (getAccessState(me) === "pending") {
    return {
      label: `Hablar con ${appConfig.brand.creatorName}`,
      target: "contact",
      icon: <MessageCircle className="h-5 w-5" />,
    };
  }
  if (getAccessState(me) === "active") {
    return {
      label: "Ver mi acceso",
      target: "access",
      icon: <ShieldCheck className="h-5 w-5" />,
    };
  }
  return {
    label: "Solicitar acceso",
    target: "access",
    icon: <CreditCard className="h-5 w-5" />,
  };
}

function accessSummary(me: MeDTO): { title: string; body: string; badge: string } {
  const state = getAccessState(me);
  if (state === "pending") {
    return {
      title: "Acceso en revisión",
      body: `${appConfig.brand.creatorName} está revisando tu caso manualmente. Si necesitas añadir algo, usa Contacto.`,
      badge: "Pendiente",
    };
  }
  if (state === "active") {
    return {
      title: "Acceso activo",
      body: daysLeftLabel(me),
      badge: "Activo",
    };
  }
  if (state === "expired") {
    return {
      title: "Acceso caducado",
      body: `${appConfig.brand.creatorName} confirma el pago y te extiende los días manualmente. Puedes renovar desde Acceso.`,
      badge: "Caducado",
    };
  }
  return {
    title: "Sin acceso activo",
    body: `${appConfig.brand.creatorName} confirma el pago y activa la entrada manualmente. Puedes solicitar acceso desde Acceso.`,
    badge: "Sin acceso",
  };
}

function daysLeftLabel(me: MeDTO): string {
  const daysLeft = me.subscription?.daysLeft;
  if (typeof daysLeft !== "number") return "Tu acceso VIP está activo.";
  if (daysLeft <= 0) return "Tu acceso caduca hoy. Puedes renovar desde Acceso.";
  return `Tu acceso sigue activo. Quedan ${daysLeft} días.`;
}
