import { createAdminClient } from "@/lib/supabase/admin";

export async function jobStarted(jobName: string, startedAt = new Date()) {
  const { error } = await createAdminClient().from("system_jobs").upsert({
    job_name: jobName,
    last_started_at: startedAt.toISOString(),
    last_error_message: null
  }, { onConflict: "job_name" });
  if (error) throw error;
}

export async function jobFinished(jobName: string, startedAt: Date, result: unknown, error?: unknown) {
  const finishedAt = new Date();
  const payload: Record<string, unknown> = {
    job_name: jobName,
    last_finished_at: finishedAt.toISOString(),
    last_duration_ms: finishedAt.getTime() - startedAt.getTime(),
    last_result_summary: result,
    ...(error
      ? {
          last_error_at: finishedAt.toISOString(),
          last_error_message: error instanceof Error ? error.message : String(error)
        }
      : {
          last_success_at: finishedAt.toISOString(),
          last_error_message: null
        })
  };
  const { error: dbError } = await createAdminClient().from("system_jobs").upsert(payload, { onConflict: "job_name" });
  if (dbError) throw dbError;
}
