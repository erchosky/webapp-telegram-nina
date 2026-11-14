export const quickExpiryPresetValues = ["plus_1_month", "plus_2_months", "plus_3_months", "plus_15_days", "plus_7_days"] as const;
export type QuickExpiryPreset = typeof quickExpiryPresetValues[number];

export type SubscriptionDateState = {
  status?: string | null;
  ends_at?: string | null;
};

function utcMonthParts(date: Date, months: number) {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return { year, month };
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addNaturalMonths(date: Date, months: number) {
  const { year, month } = utcMonthParts(date, months);
  const day = Math.min(date.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(
    year,
    month,
    day,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function quickExpiryBase(subscription: SubscriptionDateState | null | undefined, now = new Date()) {
  if (subscription?.status === "active" && subscription.ends_at) {
    const endsAt = new Date(subscription.ends_at);
    if (!Number.isNaN(endsAt.getTime()) && endsAt > now) return endsAt;
  }
  return now;
}

export function quickSubscriptionEndDate(preset: QuickExpiryPreset, subscription: SubscriptionDateState | null | undefined, now = new Date()) {
  const base = quickExpiryBase(subscription, now);
  if (preset === "plus_1_month") return addNaturalMonths(base, 1);
  if (preset === "plus_2_months") return addNaturalMonths(base, 2);
  if (preset === "plus_3_months") return addNaturalMonths(base, 3);
  if (preset === "plus_15_days") return addDays(base, 15);
  return addDays(base, 7);
}
