import "server-only";
import { randomUUID } from "node:crypto";
import type { AdminClient } from "@/lib/supabase/admin";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 32;
export const MAX_IMAGE_DIMENSION = 4096;
const BUCKET = "creator-assets";
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ValidatedImage = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  size: number;
  width: number;
  height: number;
};

export async function validateImageFile(value: FormDataEntryValue | null): Promise<ValidatedImage | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_IMAGE_BYTES) throw new Error("La imagen supera el máximo de 5 MB.");
  if (!allowedMime.has(value.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  const claimedExtension = value.name.split(".").pop()?.toLowerCase();
  const expectedExtension = extensions[value.type];
  if (!claimedExtension || !extensionMatches(claimedExtension, expectedExtension)) {
    throw new Error("La extensión del archivo no coincide con su formato.");
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const detectedMime = detectMime(bytes);
  if (detectedMime !== value.type) throw new Error("El contenido del archivo no coincide con el MIME declarado.");
  const dimensions = imageDimensions(bytes, detectedMime);
  if (!dimensions) throw new Error("No se pudieron validar las dimensiones de la imagen.");
  if (
    dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION ||
    dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION
  ) {
    throw new Error(`La imagen debe medir entre ${MIN_IMAGE_DIMENSION} y ${MAX_IMAGE_DIMENSION} px por lado.`);
  }
  return { bytes, mimeType: detectedMime, extension: expectedExtension, size: value.size, ...dimensions };
}

export async function uploadValidatedImage(
  db: AdminClient,
  folder: "items" | "categories" | "branding",
  image: ValidatedImage,
) {
  const storagePath = `marketplace/${folder}/${randomUUID()}.${image.extension}`;
  const uploaded = await db.storage.from(BUCKET).upload(storagePath, image.bytes, {
    contentType: image.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message || "No se pudo subir la imagen.");
  const { data } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

export async function removeOwnedImage(db: AdminClient, storagePath: string | null | undefined) {
  if (!storagePath || !isOwnedImagePath(storagePath)) return false;
  const result = await db.storage.from(BUCKET).remove([storagePath]);
  if (result.error) throw new Error(result.error.message || "No se pudo limpiar la imagen anterior.");
  return true;
}

export function isOwnedImagePath(value: string) {
  return /^marketplace\/(items|categories|branding)\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value);
}

export function storagePathFromPublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/public/creator-assets/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    return isOwnedImagePath(path) ? path : null;
  } catch {
    return null;
  }
}

function extensionMatches(claimed: string, expected: string) {
  return claimed === expected || (expected === "jpg" && claimed === "jpeg");
}

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && text(bytes, 1, 3) === "PNG") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 30 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (mime === "image/webp") return webpDimensions(bytes);
  return null;
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  const chunk = text(bytes, 12, 4);
  if (chunk === "VP8X") {
    return { width: 1 + uint24(bytes, 24), height: 1 + uint24(bytes, 27) };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  return null;
}

function uint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function text(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
