export interface MiniappPlan {
  id: string;
  name: string;
  displayPrice: string;
  description: string;
  durationLabel: string;
  renewalText: string;
  badge?: string;
  highlighted?: boolean;
  amountExpected: number;
  currency: "EUR";
}

export const MINIAPP_PLANS: MiniappPlan[] = [
  {
    id: "vip_entry_30d",
    name: "Entrada VIP 30 días",
    displayPrice: "50 EUR",
    description: "Alta inicial al privado. Pagas fuera de la MiniApp y Nina confirma el acceso manualmente.",
    durationLabel: "30 días",
    renewalText: "Alta manual con revisión",
    amountExpected: 50,
    currency: "EUR",
  },
  {
    id: "vip_monthly_renewal",
    name: "Renovación mensual",
    displayPrice: "45 EUR",
    description: "Para seguir dentro sin perder el acceso. Nina revisa el pago y extiende tus días.",
    durationLabel: "30 días",
    renewalText: "Renovación mensual manual",
    highlighted: true,
    amountExpected: 45,
    currency: "EUR",
  },
  {
    id: "vip_3m",
    name: "Pack 3 meses",
    displayPrice: "120 EUR",
    description: "Tres meses de VIP en un solo pago. Menos gestiones y acceso coordinado manualmente.",
    durationLabel: "90 días",
    renewalText: "Pack trimestral manual",
    badge: "Más cómodo",
    amountExpected: 120,
    currency: "EUR",
  },
];

export function planById(id: string | null | undefined): MiniappPlan | null {
  return MINIAPP_PLANS.find((plan) => plan.id === id) ?? null;
}
