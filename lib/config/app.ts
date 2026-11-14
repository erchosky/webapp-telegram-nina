import { miniappBrand } from "@/lib/miniapp/brand";
import { MINIAPP_PLANS, planById } from "@/lib/miniapp/plans";
import { ENABLE_PAYMENT_INTENTS, ENABLE_REFERRALS } from "@/lib/config/features";

export const appConfig = {
  brand: miniappBrand,
  features: {
    referrals: ENABLE_REFERRALS,
    paymentIntents: ENABLE_PAYMENT_INTENTS,
  },
  plans: {
    all: MINIAPP_PLANS,
    findById: planById,
  },
  integration: {
    webappRole: "public-client-experience",
    vipGuardRole: "operations-admin-system",
  },
} as const;
