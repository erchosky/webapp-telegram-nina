import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const TELEGRAM_UPDATE_LEASE_SECONDS = 120;

type ClaimRow = {
  acquired: boolean;
  already_processed: boolean;
  in_progress: boolean;
  lease_token: string | null;
  lease_until: string | null;
};

export type TelegramUpdateClaim =
  | { claimed: true; token: string; leaseUntil: string }
  | { claimed: false; duplicate: boolean; inProgress: boolean; leaseUntil: string | null };

export async function claimTelegramUpdate(updateId: number): Promise<TelegramUpdateClaim> {
  const { data, error } = await createAdminClient().rpc("claim_telegram_update", {
    p_update_id: updateId,
    p_lease_seconds: TELEGRAM_UPDATE_LEASE_SECONDS
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] as ClaimRow | undefined : undefined;
  if (!row) throw new Error("telegram_update_claim_missing_result");
  if (row.acquired) {
    if (!row.lease_token || !row.lease_until) throw new Error("telegram_update_claim_invalid_result");
    return { claimed: true, token: row.lease_token, leaseUntil: row.lease_until };
  }
  return {
    claimed: false,
    duplicate: row.already_processed,
    inProgress: row.in_progress,
    leaseUntil: row.lease_until
  };
}

export async function completeTelegramUpdate(updateId: number, token: string) {
  const { data, error } = await createAdminClient().rpc("complete_telegram_update", {
    p_update_id: updateId,
    p_lease_token: token
  });
  if (error) throw error;
  if (data !== true) throw new Error("telegram_update_claim_lost");
}

export async function releaseTelegramUpdate(updateId: number, token: string) {
  const { data, error } = await createAdminClient().rpc("release_telegram_update", {
    p_update_id: updateId,
    p_lease_token: token
  });
  if (error) throw error;
  return data === true;
}
