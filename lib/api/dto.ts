/**
 * Data Transfer Objects exchanged between the API routes and the client.
 * Pure types only (safe to import from Client Components). These never expose
 * internal UUIDs of other users or any secret.
 */
import type { SupportedLanguage } from "@/lib/telegram/content";
import type {
  PaymentIntentStatus,
  ReferralRewardStatus,
  SubscriptionStatus,
} from "@/lib/domain/types";

export interface MeDTO {
  language: SupportedLanguage;
  user: {
    firstName: string | null;
    username: string | null;
    streakMonths: number;
  };
  subscription: {
    status: SubscriptionStatus;
    createdAt: string | null;
    startsAt: string | null;
    endsAt: string | null;
    /** Whole days until expiry (negative if already past). null if no end date. */
    daysLeft: number | null;
  } | null;
  group: {
    publicName: string | null;
    adminContact: string | null;
    paymentInstructions: string | null;
    renewalText: string | null;
    supportText: string | null;
  } | null;
  /** Whether the user already has an open payment intent awaiting review. */
  hasOpenPaymentIntent: boolean;
  /** Open manual-payment notice, if any. */
  paymentIntent: PaymentIntentDTO | null;
  /** Development-only scenario marker. Never returned by real services. */
  devScenario?: string;
}

export interface InviteDTO {
  state:
    | "available"
    | "none"
    | "inactive_subscription"
    | "expired"
    | "used"
    | "revoked";
  inviteLink: string | null;
  expireAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
}

export interface ReferralRewardDTO {
  rewardDays: number;
  status: ReferralRewardStatus;
}

export interface ReferralsDTO {
  code: string | null;
  invitedCount: number;
  rewards: ReferralRewardDTO[];
}

export interface PaymentIntentDTO {
  status: PaymentIntentStatus;
  createdAt: string;
  selectedPlanId?: string | null;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiOk<T> | ApiErr;
