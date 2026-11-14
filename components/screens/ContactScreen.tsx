"use client";

import { useState } from "react";
import { CreditCard, HelpCircle, Link2, MessageCircle, ShoppingBag } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import { useTelegram } from "@/components/TelegramProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { resolveContactTarget } from "@/lib/client/contact";
import { openPreparedContact } from "@/lib/client/openPreparedContact";
import { appConfig } from "@/lib/config/app";
import { buildSupportMessage, type SupportIntent } from "@/lib/messages/support";

const contactOptions = [
  {
    id: "renew",
    intent: "access",
    label: "Quiero entrar o renovar",
    icon: <CreditCard className="h-5 w-5" />,
  },
  {
    id: "product",
    intent: "catalog",
    label: "Me interesa algo del privado",
    icon: <ShoppingBag className="h-5 w-5" />,
  },
  {
    id: "invite",
    intent: "invite",
    label: "Tengo problema con mi enlace",
    icon: <Link2 className="h-5 w-5" />,
  },
  {
    id: "support",
    intent: "general",
    label: "Necesito comentarte otra cosa",
    icon: <HelpCircle className="h-5 w-5" />,
  },
] satisfies Array<{
  id: string;
  intent: SupportIntent;
  label: string;
  icon: React.ReactNode;
}>;

export function ContactScreen({ me }: { me: MeDTO }) {
  const { t, isDevMock, user } = useTelegram();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const displayName = me.user.firstName ?? user?.first_name ?? "Telegram";
  const username = me.user.username ?? user?.username ?? null;

  function open(optionId: (typeof contactOptions)[number]["id"]) {
    setPreview(null);
    setError(null);
    setFallbackMessage(null);
    const option = contactOptions.find((item) => item.id === optionId);
    if (!option) return;
    const message = buildSupportMessage({
      intent: option.intent,
      me,
      telegramUser: user,
      creatorName: appConfig.brand.creatorName,
    });
    const target = resolveContactTarget(me.group?.adminContact);
    const result = openPreparedContact({
      contact: me.group?.adminContact,
      isDevMock,
      invalidLabel: t.renew.contactInvalid,
      previewLabel: t.renew.contactPreview,
      message,
    });
    setError(result.error);
    setPreview(result.preview);
    if (result.error || target.kind === "telegram" || target.kind === "external") {
      setFallbackMessage(message);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-tg-button" />
          <CardTitle>Contacto</CardTitle>
        </div>
        <p className="text-sm leading-relaxed text-tg-hint">
          Elige el motivo y abre Telegram. Si el chat no se rellena solo, copia el texto y envíamelo.
        </p>
      </Card>

      <div className="space-y-2">
        {contactOptions.map((option) => (
          <Button
            key={option.id}
            variant="secondary"
            onClick={() => open(option.id)}
          >
            {option.icon}
            {option.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-center text-sm text-tg-destructive">{error}</p>}
      {fallbackMessage && (
        <Card className="space-y-3">
          <CardTitle>Texto listo para copiar</CardTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-tg-hint">
            {fallbackMessage}
          </p>
          <CopyButton value={fallbackMessage} className="min-h-11 justify-center rounded-card" />
        </Card>
      )}
      {preview && <p className="whitespace-pre-wrap text-center text-sm text-tg-hint">{preview}</p>}

      <Card className="space-y-2">
        <CardTitle>Tus datos de Telegram</CardTitle>
        <div className="rounded-card bg-tg-secondaryBg p-3">
          <p className="font-semibold">{displayName}</p>
          <p className="text-sm text-tg-hint">{username ? `@${username}` : "Usuario de Telegram"}</p>
        </div>
        <p className="text-sm leading-relaxed text-tg-hint">
          La MiniApp usa tus datos de Telegram solo para revisar acceso, enlace y soporte con {appConfig.brand.creatorName}.
        </p>
      </Card>

      <Card>
        <CardTitle>{t.help.rulesTitle}</CardTitle>
        <ul className="space-y-2 pt-1">
          {t.help.rules.map((rule) => (
            <li key={rule} className="text-sm leading-relaxed text-tg-hint">
              {rule}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
