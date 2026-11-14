import { describe, expect, it, vi } from "vitest";
import {
  isOwnedImagePath,
  removeOwnedImage,
  storagePathFromPublicUrl,
  uploadValidatedImage,
  validateImageFile,
} from "./imageUpload";

describe("admin image upload boundary", () => {
  it("valida firma, extensión y dimensiones reales de PNG", async () => {
    const file = new File([pngHeader(640, 480)], "catalogo.png", { type: "image/png" });
    await expect(validateImageFile(file)).resolves.toMatchObject({
      mimeType: "image/png",
      extension: "png",
      width: 640,
      height: 480,
    });
  });

  it("rechaza MIME falso, extensión discordante y dimensiones fuera de límite", async () => {
    await expect(validateImageFile(new File([pngHeader(100, 100)], "falso.jpg", { type: "image/jpeg" })))
      .rejects.toThrow("contenido del archivo");
    await expect(validateImageFile(new File([pngHeader(100, 100)], "falso.jpg", { type: "image/png" })))
      .rejects.toThrow("extensión");
    await expect(validateImageFile(new File([pngHeader(10, 100)], "pequena.png", { type: "image/png" })))
      .rejects.toThrow("entre 32 y 4096");
  });

  it("sube con ruta propiedad del CMS y solo elimina rutas seguras", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const db = { storage: { from: vi.fn(() => ({ upload, remove, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://demo.supabase.co/storage/v1/object/public/creator-assets/${path}` } }) })) } } as never;
    const result = await uploadValidatedImage(db, "items", { bytes: pngHeader(100, 100), mimeType: "image/png", extension: "png", size: 24, width: 100, height: 100 });
    expect(result.storagePath).toMatch(/^marketplace\/items\/[a-f0-9-]+\.png$/);
    expect(upload).toHaveBeenCalled();
    await expect(removeOwnedImage(db, result.storagePath)).resolves.toBe(true);
    await expect(removeOwnedImage(db, "private/user-file.png")).resolves.toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("extrae rutas propias desde public URLs sin aceptar hosts/rutas ajenas", () => {
    const path = "marketplace/categories/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp";
    expect(isOwnedImagePath(path)).toBe(true);
    expect(storagePathFromPublicUrl(`https://demo.supabase.co/storage/v1/object/public/creator-assets/${path}`)).toBe(path);
    expect(storagePathFromPublicUrl("https://example.com/image.webp")).toBeNull();
  });
});

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
