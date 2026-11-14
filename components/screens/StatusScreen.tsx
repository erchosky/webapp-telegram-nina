"use client";

import { CalendarClock, CreditCard, Flame, Link2, ShieldCheck, TimerReset } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import type { SubscriptionStatus } from "@/lib/domain/types";
import { useTelegram } from "@/components/TelegramProvider";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/client/cn";
import { formatDate, formatDateTime } from "@/lib/client/format";
import { getAccessState } from "@/lib/client/subscriptionState";

export function StatusScreen({
  me,
  onNavigate,
}: {
  me: MeDTO;
  onNavigate: (tab: "home" | "renew" | "invite") => void;
}) {
  const { t, language } = useTelegram();
  const sub = me.subscription;
  const accessState = getAccessState(me);
  const isPending = accessState === "pending";
  const isActive = accessState === "active";
  const isExpired = accessState === "expired";
  const intentDate = formatDateTime(me.paymentIntent?.createdAt ?? null, language);

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <CardTitle>{t.status.heroTitle}</CardTitle>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold leading-tight">
              {isPending
                ? t.status.pendingTitle
                : isActive
                  ? t.status.active
                  : isExpired
                    ? t.status.expired
                    : t.status.noSubscription}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-tg-hint">
              {isPending
                ? t.status.pendingHint
                : isActive
                  ? t.status.activeHint
                  : isExpired
                    ? t.status.expiredHint
                    : t.status.heroSubtitle}
            </p>
          </div>
          <StatusBadge status={sub?.status ?? "cancelled"} />
        </div>

        {isPending && (
          <div className="rounded-card bg-tg-secondaryBg p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TimerReset className="h-4 w-4 text-tg-button" />
              {t.status.pendingSince}
            </div>
            <p className="mt-1 text-sm text-tg-hint">{intentDate ?? t.status.pending}</p>
          </div>
        )}

        {sub ? <ExpiryRow me={me} accessState={accessState} /> : null}
      </Card>

      <Card>
        <CardTitle>{t.status.streakTitle}</CardTitle>
        <div className="flex items-center gap-2 py-1">
          <Flame
            className={cn(
              "h-5 w-5",
              me.user.streakMonths > 0 ? "text-orange-500" : "text-tg-hint",
            )}
          />
          <span className="text-base font-medium">
            {me.user.streakMonths > 0
              ? t.status.streakValue(me.user.streakMonths)
              : t.status.streakNone}
          </span>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t.status.nextStepTitle}</CardTitle>
        <div className="grid grid-cols-1 gap-2">
          <Button onClick={() => onNavigate(isPending || !sub ? "home" : "renew")}>
            <CreditCard className="h-5 w-5" />
            {isPending
              ? "Ver estado de revisión"
              : isActive
              ? "Ampliar acceso"
              : isExpired
                ? "Entrar / renovar"
                : t.status.noSubscriptionAction}
          </Button>
          {isActive && (
            <Button variant="secondary" onClick={() => onNavigate("invite")}>
              <Link2 className="h-5 w-5" />
              {t.status.viewInvite}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ExpiryRow({ me, accessState }: { me: MeDTO; accessState: ReturnType<typeof getAccessState> }) {
  const { t, language } = useTelegram();
  const sub = me.subscription;
  if (!sub) return null;

  const formatted = formatDate(sub.endsAt, language);
  const isExpired = accessState === "expired";

  let countdown: string | null = null;
  if (sub.daysLeft !== null && !isExpired) {
    countdown =
      sub.daysLeft <= 0 ? t.status.expiresToday : t.status.daysLeft(sub.daysLeft);
  }

  if (!formatted) return null;

  return (
    <div className="flex items-start gap-2 border-t border-black/5 pt-3">
      <CalendarClock className="mt-0.5 h-5 w-5 text-tg-hint" />
      <div>
        <p className="text-sm text-tg-hint">
          {isExpired ? t.status.expiredOn : t.status.expiresOn}
        </p>
        <p className="text-base font-semibold">{formatted}</p>
        {countdown && (
          <p
            className={cn(
              "mt-0.5 text-sm font-medium",
              sub.daysLeft !== null && sub.daysLeft <= 3
                ? "text-tg-destructive"
                : "text-tg-button",
            )}
          >
            {countdown}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const { t } = useTelegram();
  const label: Record<SubscriptionStatus, string> = {
    active: t.status.active,
    pending: t.status.pending,
    needs_manual_review: t.status.needsReview,
    expired: t.status.expired,
    cancelled: t.status.noSubscription,
  };
  const tone: Record<SubscriptionStatus, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    needs_manual_review: "bg-amber-100 text-amber-700",
    expired: "bg-red-100 text-red-700",
    cancelled: "bg-zinc-200 text-zinc-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
        tone[status],
      )}
    >
      {label[status]}
    </span>
  );
}
