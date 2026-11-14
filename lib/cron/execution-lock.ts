import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const CHECK_EXPIRED_JOB = "check-expired";
const CRON_LEASE_SECONDS = 120;

type LockRow = {
  acquired: boolean;
  lease_token: string | null;
  lease_until: string | null;
};

export type CronExecutionLock =
  | { acquired: true; token: string; leaseUntil: string }
  | { acquired: false; leaseUntil: string | null };

export async function claimCronExecution(): Promise<CronExecutionLock> {
  const { data, error } = await createAdminClient().rpc("claim_system_job_lock", {
    p_job_name: CHECK_EXPIRED_JOB,
    p_lease_seconds: CRON_LEASE_SECONDS
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] as LockRow | undefined : undefined;
  if (!row) throw new Error("cron_lock_missing_result");
  if (!row.acquired) return { acquired: false, leaseUntil: row.lease_until };
  if (!row.lease_token || !row.lease_until) throw new Error("cron_lock_invalid_result");
  return { acquired: true, token: row.lease_token, leaseUntil: row.lease_until };
}

export async function releaseCronExecution(token: string) {
  const { data, error } = await createAdminClient().rpc("release_system_job_lock", {
    p_job_name: CHECK_EXPIRED_JOB,
    p_lease_token: token
  });
  if (error) throw error;
  return data === true;
}
