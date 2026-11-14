import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logs", () => ({ auditLog: vi.fn(), botLog: vi.fn() }));
vi.mock("@/lib/subscriptions", () => ({ activateFor30Days: vi.fn(), activateForOneMonth: vi.fn() }));

import { validatePayment30Days } from "./payment-validation";

describe("validación manual de pago", () => {
  it("activa 1 mes, envía enlace y registra auditoría y log", async () => {
    const subscription = { id: "sub-1", vip_group_id: "group-1", starts_at: "2026-06-22T10:00:00.000Z", ends_at: "2026-07-22T10:00:00.000Z" };
    const activate = vi.fn().mockResolvedValue(subscription);
    const deliverInvite = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn().mockResolvedValue(undefined);
    const recordManualPayment = vi.fn().mockResolvedValue(undefined);

    await validatePayment30Days("user-1", deliverInvite, { activate, audit, log, recordManualPayment });

    expect(activate).toHaveBeenCalledWith("user-1");
    expect(recordManualPayment).toHaveBeenCalledWith({
      userId: "user-1",
      subscription,
      duration: { type: "months", months: 1 },
      note: "Validación manual aprobada por admin",
    });
    expect(deliverInvite).toHaveBeenCalledWith("user-1", subscription);
    expect(audit).toHaveBeenCalledWith("manual_payment_validated", expect.any(String), "user-1", expect.objectContaining({ ends_at: subscription.ends_at }));
    expect(log).toHaveBeenCalledWith("manual_payment_validated", expect.any(String), expect.objectContaining({ userId: "user-1", groupId: "group-1" }));
  });
});
