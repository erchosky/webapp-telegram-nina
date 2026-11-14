import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import type { PaymentIntentDTO } from "@/lib/api/dto";
import type { PaymentIntentRow, SubscriptionRow } from "@/lib/domain/types";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { ServiceError } from "@/lib/api/respond";
import { appConfig } from "@/lib/config/app";

/** Payment-intent statuses that still need the admin's attention. */
const OPEN_STATUSES = ["requested", "seen"] as const;

const INTENT_COLUMNS =
  "id, telegram_user_id, vip_group_id, subscription_id, status, source, note, " +
  "user_note, admin_note, selected_plan_id, amount_expected, currency, payment_method, " +
  "seen_at, resolved_at, resolved_by, created_at, updated_at";

/**
 * Whether a Postgres/PostgREST error means the `payment_intents` table does not
 * exist yet (the additive migration hasn't been applied to the shared DB).
 */
function isUndefinedTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find the table");
}

export async function getOpenPaymentIntent(
  ctx: AuthContext,
): Promise<PaymentIntentRow | null> {
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from("payment_intents")
    .select(INTENT_COLUMNS)
    .eq("telegram_user_id", user.id)
    .in("status", OPEN_STATUSES as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isUndefinedTable(error)) return null;
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "payments.getOpenPaymentIntent" },
    });
  }
  return (data as unknown as PaymentIntentRow | null) ?? null;
}

export async function hasOpenPaymentIntent(ctx: AuthContext): Promise<boolean> {
  return (await getOpenPaymentIntent(ctx)) !== null;
}

export async function getPaymentIntent(
  ctx: AuthContext,
): Promise<PaymentIntentDTO | null> {
  const intent = await getOpenPaymentIntent(ctx);
  if (!intent) return null;
  return {
    status: intent.status,
    createdAt: intent.created_at,
    selectedPlanId: intent.selected_plan_id,
  };
}

/**
 * Register a user's intent to renew/pay. The admin confirms the real payment
 * out of band (manual flow, like VIP Guard). Idempotent: if an open intent
 * already exists, it is returned instead of creating a duplicate.
 */
export async function createPaymentIntent(
  ctx: AuthContext,
  input: { selectedPlanId?: string | null } = {},
): Promise<PaymentIntentDTO> {
  const { supabase, user } = ctx;
  const selectedPlan = appConfig.plans.findById(input.selectedPlanId);

  const existing = await getOpenPaymentIntent(ctx);
  if (existing) {
    return {
      status: existing.status,
      createdAt: existing.created_at,
      selectedPlanId: existing.selected_plan_id,
    };
  }

  const current = await currentSubscription(ctx);

  const { data, error } = await supabase
    .from("payment_intents")
    .insert({
      telegram_user_id: user.id,
      vip_group_id: current?.vip_group_id ?? null,
      subscription_id: current?.id ?? null,
      status: "requested",
      source: "miniapp",
      selected_plan_id: selectedPlan?.id ?? null,
      amount_expected: selectedPlan?.amountExpected ?? null,
      currency: selectedPlan?.currency ?? null,
    })
    .select(INTENT_COLUMNS)
    .single();

  if (error) {
    if (isUndefinedTable(error)) {
      throw new ServiceError(
        503,
        "payment_intents_unavailable",
        "The payment_intents table is not provisioned yet.",
        {
          publicMessage:
            "El aviso de pago no está disponible todavía. Contacta con la administración.",
        },
      );
    }
    if (error.code === "23505") {
      const raced = await getOpenPaymentIntent(ctx);
      if (raced) {
        return {
          status: raced.status,
          createdAt: raced.created_at,
          selectedPlanId: raced.selected_plan_id,
        };
      }
    }
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "payments.createPaymentIntent", code: error.code },
    });
  }

  const intent = data as unknown as PaymentIntentRow;
  return {
    status: intent.status,
    createdAt: intent.created_at,
    selectedPlanId: intent.selected_plan_id,
  };
}

async function currentSubscription(
  ctx: AuthContext,
): Promise<SubscriptionRow | null> {
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, telegram_user_id, vip_group_id, status, starts_at, ends_at, created_at, updated_at",
    )
    .eq("telegram_user_id", user.id)
    .order("ends_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "payments.currentSubscription" },
    });
  }
  return selectCurrentSubscription((data ?? []) as unknown as SubscriptionRow[]);
}
