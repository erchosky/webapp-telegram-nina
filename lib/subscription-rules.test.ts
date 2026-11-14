import { describe, expect, it } from "vitest";
import { canSendInvite, dueWarning, isCurrentActive, isExpired, renewalEnd, renewalNeedsInvite, sendInviteRejectionMessage } from "./subscription-rules";
const now = new Date("2026-06-21T10:00:00Z");
describe("subscription rules", () => {
  it("renueva una activa desde su caducidad usando 1 mes natural", () => expect(renewalEnd(now,"active","2026-07-01T10:00:00Z").toISOString()).toBe("2026-08-01T10:00:00.000Z"));
  it("renueva una caducada desde ahora usando 1 mes natural", () => expect(renewalEnd(now,"expired","2026-06-01T10:00:00Z").toISOString()).toBe("2026-07-21T10:00:00.000Z"));
  it("elige el aviso más urgente y no lo duplica", () => { const end=new Date(now.getTime()+30*60_000); expect(dueWarning(now,end,{})).toBe("1h"); expect(dueWarning(now,end,{"1h":true})).toBeNull(); });
  it("detecta caducidad", () => expect(isExpired(now,new Date("2026-06-21T09:59:00Z"))).toBe(true));
  it("solo reenvía invitación al renovar usuarios fuera del grupo", () => {
    expect(renewalNeedsInvite(now,"active","2026-07-01T10:00:00Z")).toBe(false);
    expect(renewalNeedsInvite(now,"expired","2026-06-01T10:00:00Z")).toBe(true);
    expect(renewalNeedsInvite(now,"cancelled",null)).toBe(true);
    expect(renewalNeedsInvite(now)).toBe(true);
  });
  it("send_invite rechaza suscripciones expired, cancelled, pending y needs_manual_review", () => {
    for (const status of ["expired", "cancelled", "pending", "needs_manual_review"]) {
      const subscription = { status, ends_at: "2026-07-01T10:00:00Z" };
      expect(canSendInvite(subscription, now)).toBe(false);
      expect(sendInviteRejectionMessage(subscription, now)).toMatch(/No se puede enviar enlace/);
    }
  });
  it("send_invite solo permite active con caducidad futura", () => {
    expect(canSendInvite({ status: "active", ends_at: "2026-07-01T10:00:00Z" }, now)).toBe(true);
    expect(canSendInvite({ status: "active", ends_at: "2026-06-01T10:00:00Z" }, now)).toBe(false);
    expect(canSendInvite({ status: "active", ends_at: null }, now)).toBe(true);
  });
  it("no exige invitación nueva para active sin ends_at", () => {
    expect(renewalNeedsInvite(now, "active", null)).toBe(false);
    expect(isCurrentActive({ status: "active", ends_at: null }, now)).toBe(true);
  });
  it("un usuario con ends_at pasado no cuenta como activo", () => {
    expect(isCurrentActive({ status: "active", ends_at: "2026-06-21T09:59:00Z" }, now)).toBe(false);
    expect(isCurrentActive({ status: "active", ends_at: "2026-06-21T10:01:00Z" }, now)).toBe(true);
  });
});
