import { describe, expect, it } from "vitest";
import { dashboardErrorMessage, expulsionStatusLabel, operationalStatusLabel, subscriptionStatusLabel } from "./texts";

describe("dashboard texts", () => {
  it("traduce estados técnicos a labels humanos", () => {
    expect(operationalStatusLabel("invite_sent_pending_join")).toBe("Enlace enviado · pendiente de entrar");
    expect(operationalStatusLabel("unban_failed")).toBe("Desbloqueo fallido");
    expect(operationalStatusLabel("retry_pending")).toBe("Reintento pendiente");
    expect(subscriptionStatusLabel("active")).toBe("Activa");
    expect(expulsionStatusLabel("resolved_manual")).toBe("Resuelta manualmente");
  });

  it("renderiza errores controlados sin exponer códigos técnicos", () => {
    expect(dashboardErrorMessage("already_active")).toBe("El usuario ya tiene acceso activo. No se ha creado otro ni se ha cambiado la caducidad.");
    expect(dashboardErrorMessage("manual_expel_unban_failed")).toContain("Intentar desbloquear");
    expect(dashboardErrorMessage("manual_expel_unban_state_failed")).toContain("Revisa Telegram manualmente");
    expect(dashboardErrorMessage("telegram_rate_limited")).toContain("Reintentar enlace");
    expect(dashboardErrorMessage("missing_active_group")).toBe("Configura primero el Telegram VIP activo antes de validar pagos, renovar o enviar enlaces.");
    expect(dashboardErrorMessage("telegram_invite_permission")).toContain("permiso para crear enlaces de invitación");
    expect(dashboardErrorMessage("telegram_group_chat_id_invalid")).toContain("TELEGRAM_GROUP_CHAT_ID");
  });
});
