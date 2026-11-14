import "server-only";

import { z } from "zod";
import { readBoundedJson } from "@/lib/api/json";
import { ServiceError } from "@/lib/api/respond";
import { planById } from "@/lib/miniapp/plans";

export const MAX_PAYMENT_INTENT_BODY_BYTES = 4 * 1024;

export const paymentIntentInputSchema = z.object({
  selectedPlanId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => planById(value) !== null, "Plan desconocido"),
}).strict();

export async function parsePaymentIntentRequest(req: Request) {
  const body = await readBoundedJson(req, { maxBytes: MAX_PAYMENT_INTENT_BODY_BYTES });
  const parsed = paymentIntentInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(400, "invalid_payment_intent_input", "Datos de pago inválidos", {
      publicMessage: "Selecciona un plan válido antes de enviar el aviso.",
    });
  }
  return parsed.data;
}
