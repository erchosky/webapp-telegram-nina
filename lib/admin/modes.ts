import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminModes = {
  readOnly: boolean;
  beta: boolean;
};

export const READ_ONLY_DISABLE_CONFIRMATION = "DESACTIVAR SOLO LECTURA";

export function requiresReadOnlyDisableConfirmation(currentReadOnly: boolean, nextReadOnly: boolean) {
  return currentReadOnly && !nextReadOnly;
}

export function hasReadOnlyDisableConfirmation(value: unknown) {
  return typeof value === "string" && value.trim().toUpperCase() === READ_ONLY_DISABLE_CONFIRMATION;
}

export async function getAdminModes(): Promise<AdminModes> {
  const { data, error } = await createAdminClient()
    .from("vip_groups")
    .select("read_only_mode,beta_mode")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    readOnly: Boolean(data?.read_only_mode),
    beta: data?.beta_mode ?? true
  };
}

export async function assertNotReadOnly() {
  const modes = await getAdminModes();
  if (modes.readOnly) {
    const error = new Error("Modo solo lectura activo");
    error.name = "ReadOnlyModeError";
    throw error;
  }
}
