"use client";

import { useCallback, useState } from "react";
import {
  ExternalLink,
  LinkIcon,
  Ban,
  CheckCheck,
  Clock,
  CreditCard,
  MessageCircle,
  ShieldAlert,
} from "lucide-react";
import type { InviteDTO, MeDTO } from "@/lib/api/dto";
import { useTelegram } from "@/components/TelegramProvider";
import { Card, CardTitle } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useResource } from "@/lib/client/useResource";
import { apiFetch } from "@/lib/client/api";
import { getWebApp } from "@/lib/telegram/webapp";
import { formatDate } from "@/lib/client/format";
import { openPreparedContact } from "@/lib/client/openPreparedContact";
import { appConfig } from "@/lib/config/app";
import { buildInviteProblemMessage } from "@/lib/messages/invite";

export function InviteScreen({
  me,
  onNavigate,
}: {
  me: MeDTO;
  onNavigate: (tab: "home" | "renew" | "help") => void;
}) {
  const { t, language, isDevMock, user } = useTelegram();
  const [notice, setNotice] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const loader = useCallback(
    (signal: AbortSignal) => apiFetch<InviteDTO>("/api/invite", { signal }),
    [],
  );
  const { data, loading, error, reload } = useResource(loader, t.common.genericError);

  if (loading) return <LoadingState label={t.common.loading} />;
  if (error || !data) {
    return (
      <ErrorState
        label={error ?? t.common.genericError}
        retryLabel={t.common.retry}
        onRetry={reload}
      />
    );
  }

  const invite = data;
  const expiresOn = formatDate(invite.expireAt, language);

  function openLink() {
    if (!invite.inviteLink) return;
    setNotice(null);
    const webApp = getWebApp();
    if (isDevMock) {
      setNotice(t.invite.localOpened(invite.inviteLink));
      webApp?.HapticFeedback?.impactOccurred("light");
      return;
    }
    if (webApp) webApp.openTelegramLink(invite.inviteLink);
    else window.open(invite.inviteLink, "_blank", "noopener,noreferrer");
  }

  function contactCreator() {
    setNotice(null);
    setContactError(null);
    const result = openPreparedContact({
      contact: me.group?.adminContact,
      isDevMock,
      invalidLabel: t.renew.contactInvalid,
      previewLabel: t.renew.contactPreview,
      message: buildInviteProblemMessage({
        me,
        telegramUser: user,
        creatorName: appConfig.brand.creatorName,
        stateLabel: inviteStateLabel(invite.state),
      }),
    });
    setContactError(result.error);
    setNotice(result.preview);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle>{t.invite.title}</CardTitle>
        <p className="text-sm text-tg-hint">{t.invite.intro}</p>
      </Card>

      {invite.inviteLink ? (
        <Card className="space-y-3">
          <CardTitle>{t.invite.detailTitle}</CardTitle>
          <div className="flex items-start gap-2">
            <LinkIcon className="mt-0.5 h-5 w-5 shrink-0 text-tg-hint" />
            <p className="break-all text-sm font-medium">{invite.inviteLink}</p>
          </div>
          <p className="text-sm text-tg-hint">{t.invite.singleUseHint}</p>

          {invite.state === "revoked" && (
            <StateNote icon={<Ban className="h-4 w-4" />} text={t.invite.revoked} tone="bad" />
          )}
          {invite.state === "used" && (
            <StateNote icon={<CheckCheck className="h-4 w-4" />} text={t.invite.used} />
          )}
          {expiresOn && invite.state === "available" && (
            <p className="text-sm text-tg-hint">
              {t.invite.expiresOn} {expiresOn}
            </p>
          )}

          <div className="flex gap-2">
            <CopyButton
              value={invite.inviteLink}
              className="min-h-11 flex-1 justify-center rounded-card"
            />
            <Button className="flex-1" onClick={openLink}>
              <ExternalLink className="h-4 w-4" />
              {t.invite.openLink}
            </Button>
          </div>
          {notice && <p className="text-sm text-tg-hint">{notice}</p>}
        </Card>
      ) : (
        <Card className="space-y-3">
          <EmptyInvite data={invite} expiresOn={expiresOn} />
          <InviteStateAction
            data={invite}
            hasActiveVip={me.subscription?.status === "active"}
            onContact={contactCreator}
            onNavigate={onNavigate}
          />
          {notice && <p className="text-sm text-tg-hint">{notice}</p>}
          {contactError && <p className="text-sm text-tg-destructive">{contactError}</p>}
        </Card>
      )}
    </div>
  );
}

function InviteStateAction({
  data,
  hasActiveVip,
  onContact,
  onNavigate,
}: {
  data: InviteDTO;
  hasActiveVip: boolean;
  onContact: () => void;
  onNavigate: (tab: "home" | "renew" | "help") => void;
}) {
  if (data.state === "inactive_subscription") {
    return (
      <Button onClick={() => onNavigate("home")}>
        <CreditCard className="h-5 w-5" />
        Solicitar acceso
      </Button>
    );
  }

  if (data.state === "expired") {
    return hasActiveVip ? (
      <Button variant="secondary" onClick={onContact}>
        <MessageCircle className="h-5 w-5" />
        Problema con mi enlace
      </Button>
    ) : (
      <Button onClick={() => onNavigate("renew")}>
        <CreditCard className="h-5 w-5" />
        Entrar / renovar
      </Button>
    );
  }

  if (data.state === "used" || data.state === "revoked") {
    return (
      <Button variant="secondary" onClick={onContact}>
        <MessageCircle className="h-5 w-5" />
        {`Hablar con ${appConfig.brand.creatorName}`}
      </Button>
    );
  }

  return (
    <Button variant="secondary" onClick={() => onNavigate("help")}>
      <LinkIcon className="h-5 w-5" />
      Ver cómo se entrega
    </Button>
  );
}

function inviteStateLabel(state: InviteDTO["state"]): string {
  const labels: Record<InviteDTO["state"], string> = {
    available: "disponible",
    none: "no generado",
    inactive_subscription: "sin acceso activo",
    expired: "caducado",
    used: "usado",
    revoked: "revocado",
  };
  return labels[state];
}

function EmptyInvite({
  data,
  expiresOn,
}: {
  data: InviteDTO;
  expiresOn: string | null;
}) {
  const { t } = useTelegram();

  const icon =
    data.state === "inactive_subscription" ? (
      <ShieldAlert className="h-5 w-5 text-tg-destructive" />
    ) : data.state === "expired" ? (
      <Clock className="h-5 w-5 text-tg-destructive" />
    ) : data.state === "used" ? (
      <CheckCheck className="h-5 w-5 text-tg-hint" />
    ) : data.state === "revoked" ? (
      <Ban className="h-5 w-5 text-tg-destructive" />
    ) : (
      <LinkIcon className="h-5 w-5 text-tg-hint" />
    );

  const title: Record<InviteDTO["state"], string> = {
    available: t.invite.none,
    none: t.invite.none,
    inactive_subscription: t.invite.inactiveTitle,
    expired: t.invite.expired,
    used: t.invite.used,
    revoked: t.invite.revoked,
  };

  const hint: Record<InviteDTO["state"], string> = {
    available: t.invite.noneHint,
    none: t.invite.noneHint,
    inactive_subscription: t.invite.inactiveHint,
    expired: expiresOn
      ? `${t.invite.expiredHint} ${t.invite.expiresOn} ${expiresOn}.`
      : t.invite.expiredHint,
    used: t.invite.usedHint,
    revoked: t.invite.revokedHint,
  };

  return (
    <div className="flex items-start gap-3">
      {icon}
      <div>
        <p className="text-base font-medium">{title[data.state]}</p>
        <p className="mt-1 text-sm text-tg-hint">{hint[data.state]}</p>
      </div>
    </div>
  );
}

function StateNote({
  icon,
  text,
  tone = "muted",
}: {
  icon: React.ReactNode;
  text: string;
  tone?: "muted" | "bad";
}) {
  return (
    <p
      className={
        tone === "bad"
          ? "flex items-center gap-1.5 text-sm font-medium text-tg-destructive"
          : "flex items-center gap-1.5 text-sm text-tg-hint"
      }
    >
      {icon}
      {text}
    </p>
  );
}
