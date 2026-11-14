/** Whole days from `now` until `iso` (negative if `iso` is in the past). */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs === 0) return 0;
  if (diffMs < 0) return Math.floor(diffMs / dayMs);
  return Math.ceil(diffMs / dayMs);
}
