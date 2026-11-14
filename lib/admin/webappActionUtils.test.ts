import { describe, expect, it } from "vitest";
import {
  applySoldStatusFields,
  normalizePublicImageUrl,
  parseSettingJson,
  shouldMarkImagePrimary,
  type MarketplaceItemPayload,
} from "@/lib/admin/webappActionUtils";

const baseItem: MarketplaceItemPayload = {
  category_id: null,
  title: "Producto",
  description: null,
  visible_terms: null,
  price: null,
  currency: "EUR",
  price_label: null,
  status: "available",
  public_visible: true,
  is_featured: false,
  sort_order: 100,
  sold_visibility_until: null,
  requires_active_access: false,
  cta_label: "Me interesa",
  contact_intent: null,
  kind: "physical_piece",
  delivery_type: "manual",
};

describe("webapp action utils", () => {
  it("setea sold_at cuando el status pasa a sold y estaba vacío", () => {
    const now = new Date("2026-06-30T18:00:00.000Z");
    const payload = applySoldStatusFields({ ...baseItem, status: "sold" }, null, now);

    expect(payload.sold_at).toBe("2026-06-30T18:00:00.000Z");
  });

  it("limpia sold_at y sold_visibility_until cuando deja de estar vendido", () => {
    const payload = applySoldStatusFields(
      {
        ...baseItem,
        status: "available",
        sold_visibility_until: "2026-07-01T18:00:00.000Z",
      },
      "2026-06-30T18:00:00.000Z",
    );

    expect(payload.sold_at).toBeNull();
    expect(payload.sold_visibility_until).toBeNull();
  });

  it("devuelve un error amable si el JSON de settings es inválido", () => {
    expect(() => parseSettingJson("{ nope")).toThrow("JSON inválido en configuración");
  });

  it("permite una sola imagen primary por decisión de inserción", () => {
    expect(shouldMarkImagePrimary({ requestedPrimary: false, existingImageCount: 0 })).toBe(true);
    expect(shouldMarkImagePrimary({ requestedPrimary: false, existingImageCount: 2 })).toBe(false);
    expect(shouldMarkImagePrimary({ requestedPrimary: true, existingImageCount: 2 })).toBe(true);
  });

  it("solo acepta public_url http o https de hosts de imagen permitidos", () => {
    expect(normalizePublicImageUrl("https://demo.supabase.co/storage/v1/object/public/items/image.jpg")).toBe("https://demo.supabase.co/storage/v1/object/public/items/image.jpg");
    expect(normalizePublicImageUrl("https://t.me/i/userpic/320/avatar.jpg")).toBe("https://t.me/i/userpic/320/avatar.jpg");
    expect(() => normalizePublicImageUrl("https://example.com/image.jpg")).toThrow("URL pública inválida");
    expect(() => normalizePublicImageUrl("javascript:alert(1)")).toThrow("URL pública inválida");
  });
});
