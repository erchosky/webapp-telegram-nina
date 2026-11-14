import { describe, expect, it } from "vitest";
import { messagesFor, telegramLanguage } from "@/lib/telegram/content";
import { en } from "@/lib/telegram/content/en";
import { es } from "@/lib/telegram/content/es";
import { pt } from "@/lib/telegram/content/pt";

describe("telegramLanguage", () => {
  it("maps en* to en", () => {
    expect(telegramLanguage("en")).toBe("en");
    expect(telegramLanguage("en-US")).toBe("en");
  });

  it("maps pt* to pt", () => {
    expect(telegramLanguage("pt")).toBe("pt");
    expect(telegramLanguage("pt-BR")).toBe("pt");
  });

  it("defaults everything else to es", () => {
    expect(telegramLanguage("es")).toBe("es");
    expect(telegramLanguage("fr")).toBe("es");
    expect(telegramLanguage(undefined)).toBe("es");
    expect(telegramLanguage(null)).toBe("es");
    expect(telegramLanguage("")).toBe("es");
  });
});

describe("messagesFor", () => {
  it("returns the matching bundle", () => {
    expect(messagesFor("en")).toBe(en);
    expect(messagesFor("pt-BR")).toBe(pt);
    expect(messagesFor("de")).toBe(es);
  });

  it("keeps all locales structurally in sync", () => {
    const keys = (o: object): string[] =>
      Object.entries(o)
        .flatMap(([k, v]) =>
          v && typeof v === "object" ? keys(v).map((sub) => `${k}.${sub}`) : [k],
        )
        .sort();
    expect(keys(en)).toEqual(keys(es));
    expect(keys(pt)).toEqual(keys(es));
  });
});
