import { describe, expect, it } from "vitest";
import { telegramMessages } from "./telegram/messages";
import { userAccessMessage, userAccessStatus } from "./user-access";

const now = new Date("2026-06-22T10:00:00Z");

describe("estado de acceso del usuario", () => {
  it("deja pendiente a un usuario sin suscripción y no muestra caducidad", () => {
    expect(userAccessStatus(null, now)).toBe("pending_validation");
    expect(userAccessMessage(null, now)).toBe(telegramMessages.startPending());
    expect(userAccessMessage(null, now)).not.toContain("caduca");
  });

  it("muestra la caducidad a un usuario activo", () => {
    const subscription = { status: "active", ends_at: "2026-07-22T10:00:00Z" };
    expect(userAccessStatus(subscription, now)).toBe("active");
    expect(userAccessMessage(subscription, now)).toContain("22 de julio de 2026");
  });

  it("considera activa una suscripción active sin fecha de caducidad", () => {
    const subscription = { status: "active", ends_at: null };
    expect(userAccessStatus(subscription, now)).toBe("active");
    expect(userAccessMessage(subscription, now)).toContain("sin fecha de caducidad configurada");
  });

  it("considera caducada una suscripción activa cuya fecha ya pasó", () => {
    const subscription = { status: "active", ends_at: "2026-06-21T10:00:00Z" };
    expect(userAccessStatus(subscription, now)).toBe("expired");
    expect(userAccessMessage(subscription, now)).toContain("caducado");
  });

  it("mantiene needs_manual_review fuera de activo y caducado automático", () => {
    const subscription = { status: "needs_manual_review", ends_at: null };
    expect(userAccessStatus(subscription, now)).toBe("needs_manual_review");
    expect(userAccessMessage(subscription, now)).toBe(telegramMessages.startPending());
  });
});
