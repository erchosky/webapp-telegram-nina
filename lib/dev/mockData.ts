import type { InviteDTO, MeDTO, ReferralsDTO } from "@/lib/api/dto";
import { appConfig } from "@/lib/config/app";

export type DevScenario =
  | "onboarding"
  | "no_vip"
  | "choosing_plan"
  | "active_vip"
  | "expired_vip"
  | "payment_pending"
  | "invite_available"
  | "invite_used"
  | "invite_expired"
  | "api_error"
  | "loading";

export const DEV_SCENARIOS: { id: DevScenario }[] = [
  { id: "onboarding" },
  { id: "no_vip" },
  { id: "choosing_plan" },
  { id: "active_vip" },
  { id: "expired_vip" },
  { id: "payment_pending" },
  { id: "invite_available" },
  { id: "invite_used" },
  { id: "invite_expired" },
  { id: "api_error" },
  { id: "loading" },
];

export const VISIBLE_DEV_SCENARIOS: { id: DevScenario }[] = DEV_SCENARIOS;

export function devMe(scenario: DevScenario): MeDTO {
  const active =
    scenario === "active_vip" ||
    scenario.startsWith("invite");
  const expired = scenario === "expired_vip";
  const pendingIntent = scenario === "payment_pending";

  return {
    language: "es",
    user: {
      firstName: appConfig.brand.creatorName,
      username: "creator_dev",
      streakMonths: active ? 4 : 0,
    },
    subscription: active
      ? {
          status: "active",
          createdAt: daysFromNow(-120),
          startsAt: daysFromNow(-20),
          endsAt: daysFromNow(10),
          daysLeft: 10,
        }
      : pendingIntent
        ? {
            status: "needs_manual_review",
            createdAt: daysFromNow(-1),
            startsAt: null,
            endsAt: null,
            daysLeft: null,
          }
        : expired
        ? {
            status: "expired",
            createdAt: daysFromNow(-90),
            startsAt: daysFromNow(-60),
            endsAt: daysFromNow(-2),
            daysLeft: -2,
          }
        : null,
    group: {
      publicName: `${appConfig.brand.productName} de ${appConfig.brand.creatorName}`,
      adminContact: "@creator_dev",
      paymentInstructions:
        `Bizum o transferencia fuera de la MiniApp.\nHabla con ${appConfig.brand.creatorName} para coordinar el acceso.`,
      renewalText: `1) Elige una opción de acceso.\n2) Habla con ${appConfig.brand.creatorName} para coordinar el pago.\n3) ${appConfig.brand.creatorName} revisa manualmente y activa tu acceso.`,
      supportText: `Contacta con ${appConfig.brand.creatorName} si necesitas ayuda.`,
    },
    hasOpenPaymentIntent: pendingIntent,
    paymentIntent: pendingIntent
      ? { status: "requested", createdAt: daysFromNow(-1) }
      : null,
    devScenario: scenario,
  };
}

export function devInvite(scenario: DevScenario): InviteDTO {
  if (
    scenario === "onboarding" ||
    scenario === "no_vip" ||
    scenario === "choosing_plan" ||
    scenario === "expired_vip" ||
    scenario === "payment_pending"
  ) {
    return emptyInvite("inactive_subscription");
  }
  if (scenario === "invite_used") {
    return {
      state: "used",
      inviteLink: null,
      expireAt: daysFromNow(3),
      usedAt: daysFromNow(-1),
      revokedAt: null,
    };
  }
  if (scenario === "invite_expired") {
    return {
      state: "expired",
      inviteLink: null,
      expireAt: daysFromNow(-1),
      usedAt: null,
      revokedAt: null,
    };
  }
  if (scenario === "active_vip") {
    return emptyInvite("none");
  }
  return {
    state: "available",
    inviteLink: "https://t.me/+vipGuardDevInvite",
    expireAt: daysFromNow(3),
    usedAt: null,
    revokedAt: null,
  };
}

export function devReferrals(_scenario: DevScenario): ReferralsDTO {
  return {
    code: null,
    invitedCount: 0,
    rewards: [],
  };
}

export function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function emptyInvite(state: InviteDTO["state"]): InviteDTO {
  return { state, inviteLink: null, expireAt: null, usedAt: null, revokedAt: null };
}
