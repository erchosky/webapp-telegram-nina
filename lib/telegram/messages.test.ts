import { describe, expect, it } from "vitest";
import { messagesFor, telegramLanguage, telegramMessages } from "./messages";

describe("telegramMessages", () => {
  it("renderiza /start activo con grupo y fecha", () => {
    const text = telegramMessages.startActive({
      nombreGrupo: "Grupo VIP",
      fechaCaducidad: "2026-07-05T10:06:00.000Z"
    });

    expect(text).toContain("Grupo VIP");
    expect(text).toContain("2026");
  });

  it("renderiza enlace enviado con link personal", () => {
    const text = telegramMessages.inviteSent("https://t.me/+personal", { nombreGrupo: "Grupo Test" });

    expect(text).toContain("https://t.me/+personal");
    expect(text).toContain("Grupo Test");
  });

  it("renderiza /id de grupo con chat id y título", () => {
    expect(telegramMessages.idGroup(123, -100456, "supergroup", "VIP")).toBe(
      "Tu Telegram ID es: 123\nChat ID del grupo: -100456\nTipo de chat: supergroup\nNombre del grupo: VIP"
    );
  });

  it.each([
    ["es", "es", "Por privacidad"],
    ["en", "en", "For privacy"],
    ["fr", "es", "Por privacidad"]
  ])("selecciona idioma %s → %s", (input, expectedLang, expectedText) => {
    expect(telegramLanguage(input)).toBe(expectedLang);
    expect(messagesFor(input).statusPrivateOnly).toContain(expectedText);
  });

  it("mantiene URLs sin traducir en mensajes en inglés", () => {
    const text = messagesFor("en").inviteSent("https://t.me/+personal", { nombreGrupo: "VIP Group" });

    expect(text).toContain("https://t.me/+personal");
    expect(text).toContain("VIP Group");
  });

  it("centraliza aviso 48h y mensaje de migración", () => {
    expect(telegramMessages.warning48h()).toContain("Te quedan 2 días");
    expect(telegramMessages.existingGroupMigration("@vip_guard_bot")).toContain("@vip_guard_bot");
  });
});
