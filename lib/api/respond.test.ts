import { describe, expect, it, vi } from "vitest";
import { GENERIC_CLIENT_ERROR, ServiceError, withAuth } from "@/lib/api/respond";

vi.mock("@/lib/telegram/auth", () => ({
  authenticate: vi.fn(async () => ({
    supabase: {},
    tgUser: { id: 123 },
    user: { id: "user-1", telegram_user_id: 123 },
  })),
  AuthError: class AuthError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message ?? code);
      this.status = status;
      this.code = code;
    }
  },
}));

describe("withAuth", () => {
  it("does not expose raw db_error messages", async () => {
    const route = withAuth(async () => {
      throw new ServiceError(500, "db_error", "relation payment_intents does not exist");
    });

    const res = await route(new Request("http://localhost/api/me"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toBe(GENERIC_CLIENT_ERROR);
    expect(body.error.message).not.toContain("payment_intents");
  });
});
