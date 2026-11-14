export type MarketplaceItemPayload = {
  category_id: string | null;
  title: string;
  description: string | null;
  visible_terms: string | null;
  price: number | null;
  currency: string;
  price_label: string | null;
  status: string;
  public_visible: boolean;
  is_featured: boolean;
  sort_order: number;
  sold_visibility_until: string | null;
  requires_active_access: boolean;
  cta_label: string;
  contact_intent: string | null;
  kind: string;
  delivery_type: string;
  sold_at?: string | null;
};

export type MarketplaceItemImagePayload = {
  item_id: string;
  storage_path: string | null;
  public_url: string | null;
  alt_text: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  is_primary: boolean;
  sort_order: number;
};

export function applySoldStatusFields(
  payload: MarketplaceItemPayload,
  existingSoldAt: string | null | undefined,
  now = new Date(),
): MarketplaceItemPayload {
  if (payload.status === "sold") {
    return {
      ...payload,
      sold_at: existingSoldAt ?? now.toISOString(),
    };
  }

  return {
    ...payload,
    sold_at: null,
    sold_visibility_until: null,
  };
}

export function parseSettingJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("JSON inválido en configuración");
  }
}

export function normalizePublicImageUrl(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL pública inválida: usa una URL http o https");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL pública inválida: usa una URL http o https");
  }
  if (!isAllowedPublicImageHost(url.hostname)) {
    throw new Error("URL pública inválida: usa una imagen de Supabase Storage, t.me o telegram.org");
  }
  return url.toString();
}

function isAllowedPublicImageHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "telegram.org" || normalized === "t.me" || normalized.endsWith(".supabase.co");
}

export function shouldMarkImagePrimary(input: {
  requestedPrimary: boolean;
  existingImageCount: number;
}) {
  return input.requestedPrimary || input.existingImageCount === 0;
}
