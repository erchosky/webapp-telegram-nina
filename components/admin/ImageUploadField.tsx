"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, UploadCloud, X } from "lucide-react";
import Image from "next/image";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_SIDE = 1600;

export function ImageUploadField({
  name = "image_file",
  label = "Imagen",
  currentUrl,
  removeName,
}: {
  name?: string;
  label?: string;
  currentUrl?: string | null;
  removeName?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [message, setMessage] = useState("JPG, PNG o WebP · máximo 5 MB guardados · entre 32 y 4096 px");
  const [busy, setBusy] = useState(false);
  const [removeCurrent, setRemoveCurrent] = useState(false);

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("Validando y optimizando imagen...");
    try {
      if (!ACCEPT.split(",").includes(file.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
      if (file.size > MAX_SOURCE_BYTES) throw new Error("El archivo original supera 8 MB.");
      const bitmap = await createImageBitmap(file);
      if (bitmap.width < 32 || bitmap.height < 32 || bitmap.width > 4096 || bitmap.height > 4096) {
        bitmap.close();
        throw new Error("La imagen debe medir entre 32 y 4096 px por lado.");
      }
      const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!blob) throw new Error("El navegador no pudo optimizar la imagen.");
      if (blob.size > 5 * 1024 * 1024) throw new Error("La imagen optimizada todavía supera 5 MB.");
      const optimized = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      if (inputRef.current) inputRef.current.files = transfer.files;
      setPreview((old) => { if (old.startsWith("blob:")) URL.revokeObjectURL(old); return URL.createObjectURL(optimized); });
      setRemoveCurrent(false);
      setMessage(`${canvas.width} × ${canvas.height} px · ${(optimized.size / 1024).toFixed(0)} KB · WebP optimizado`);
    } catch (error) {
      if (inputRef.current) inputRef.current.value = "";
      setMessage(error instanceof Error ? error.message : "No se pudo preparar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-2 rounded-card border border-black/10 p-3 md:col-span-2">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <label
        htmlFor={id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files[0]); }}
        className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-black/20 bg-tg-bg p-3 text-center"
      >
        {preview && !removeCurrent ? <Image src={preview} alt="Vista previa antes de guardar" width={640} height={320} unoptimized className="max-h-40 w-full rounded-card object-contain" /> : <><ImageIcon className="h-8 w-8 text-tg-hint" /><span className="text-sm font-semibold">Arrastra una imagen o selecciónala</span></>}
        <span className="inline-flex items-center gap-2 text-xs text-tg-button"><UploadCloud className="h-4 w-4" /> Elegir archivo</span>
      </label>
      <input ref={inputRef} id={id} name={name} type="file" accept={ACCEPT} disabled={busy} className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
      <p className={`text-xs ${message.includes("Usa") || message.includes("supera") || message.includes("No se") ? "text-tg-destructive" : "text-tg-hint"}`} aria-live="polite">{message}</p>
      {removeName && currentUrl ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={removeName} checked={removeCurrent} onChange={(event) => setRemoveCurrent(event.target.checked)} /> <X className="h-4 w-4" /> Quitar imagen actual al guardar</label> : null}
    </fieldset>
  );
}
