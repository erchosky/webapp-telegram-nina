import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { assertNotReadOnly, hasReadOnlyDisableConfirmation, requiresReadOnlyDisableConfirmation, getAdminModes } from "./modes";

describe("admin modes", () => {
  it("detecta modo solo lectura y bloquea mutaciones", async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: { read_only_mode: true, beta_mode: true }, error: null })
          })
        })
      })
    });

    await expect(getAdminModes()).resolves.toEqual({ readOnly: true, beta: true });
    await expect(assertNotReadOnly()).rejects.toMatchObject({ name: "ReadOnlyModeError" });
  });

  it("solo exige confirmación fuerte al desactivar solo lectura", () => {
    expect(requiresReadOnlyDisableConfirmation(true, false)).toBe(true);
    expect(requiresReadOnlyDisableConfirmation(true, true)).toBe(false);
    expect(requiresReadOnlyDisableConfirmation(false, true)).toBe(false);
    expect(hasReadOnlyDisableConfirmation("DESACTIVAR SOLO LECTURA")).toBe(true);
    expect(hasReadOnlyDisableConfirmation(" desactivar solo lectura ")).toBe(true);
  });
});
