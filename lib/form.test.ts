import { describe, expect, it } from "vitest";
import { parseCheckbox } from "./form";

describe("parseCheckbox", () => {
  it("acepta valores comunes de checkbox/html/api", () => {
    for (const value of ["on", "true", "1"]) {
      const form = new FormData();
      form.set("flag", value);
      expect(parseCheckbox(form, "flag")).toBe(true);
    }
  });

  it("trata ausencia y valores desconocidos como false", () => {
    const form = new FormData();
    expect(parseCheckbox(form, "flag")).toBe(false);
    form.set("flag", "off");
    expect(parseCheckbox(form, "flag")).toBe(false);
  });
});
