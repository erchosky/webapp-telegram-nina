"use client";

import type { PaymentIntentDTO } from "@/lib/api/dto";
import { ENABLE_PAYMENT_INTENTS, ENABLE_REFERRALS } from "@/lib/config/features";
import { devInvite, devMe, devReferrals } from "@/lib/dev/mockData";
import { getDevScenario, isDevMockActive, setDevScenario } from "@/lib/dev/mockTelegram";

export async function mockApiFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; signal?: AbortSignal; body?: unknown } = {},
): Promise<T> {
  if (!isDevMockActive()) throw new Error("Dev mock is not active");
  const scenario = getDevScenario();
  const method = init.method ?? "GET";

  if (scenario === "loading") {
    await new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 120));

  if (scenario === "api_error") {
    throw new Error("Error de API simulado en local.");
  }

  if (path === "/api/me" && method === "GET") return devMe(scenario) as T;
  if (path === "/api/invite" && method === "GET") return devInvite(scenario) as T;
  if (path === "/api/referrals" && method === "GET") {
    if (!ENABLE_REFERRALS) throw new Error("Referrals are disabled.");
    return devReferrals(scenario) as T;
  }

  if (path === "/api/payments/intent" && method === "POST") {
    if (!ENABLE_PAYMENT_INTENTS) throw new Error("Payment intents are disabled.");
    setDevScenario("payment_pending");
    const response = {
      status: "requested",
      createdAt: new Date().toISOString(),
      selectedPlanId:
        typeof init.body === "object" &&
        init.body !== null &&
        "selectedPlanId" in init.body
          ? String((init.body as { selectedPlanId?: unknown }).selectedPlanId)
          : null,
    } satisfies PaymentIntentDTO;
    return response as T;
  }

  if (path === "/api/referrals/code" && method === "POST") {
    if (!ENABLE_REFERRALS) throw new Error("Referrals are disabled.");
    return { code: "NINA2026" } as T;
  }

  throw new Error(`No mock handler for ${method} ${path}`);
}
