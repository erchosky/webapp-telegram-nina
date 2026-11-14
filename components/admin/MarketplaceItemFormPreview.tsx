"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import Image from "next/image";

type Preview = { title: string; description: string; terms: string; price: string; cta: string; category: string; status: string; imageUrl: string };
const empty: Preview = { title: "Título del artículo", description: "La descripción aparecerá aquí.", terms: "", price: "", cta: "Me interesa", category: "Sin categoría", status: "Disponible", imageUrl: "" };

export function MarketplaceItemFormPreview({ currentImageUrl }: { currentImageUrl?: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview>({ ...empty, imageUrl: currentImageUrl ?? "" });
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    let blobUrl = "";
    const update = () => {
      const data = new FormData(form);
      const select = form.elements.namedItem("category_id") as HTMLSelectElement | null;
      const status = form.elements.namedItem("status") as HTMLSelectElement | null;
      const file = data.get("image_file");
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = file instanceof File && file.size > 0 ? URL.createObjectURL(file) : "";
      const priceLabel = text(data.get("price_label"));
      const amount = text(data.get("price"));
      const currency = text(data.get("currency")) || "EUR";
      setPreview({
        title: text(data.get("title")) || empty.title,
        description: text(data.get("description")) || empty.description,
        terms: text(data.get("visible_terms")),
        price: priceLabel || (amount ? `${amount} ${currency}` : ""),
        cta: text(data.get("cta_label")) || empty.cta,
        category: select?.selectedOptions[0]?.text || empty.category,
        status: status?.selectedOptions[0]?.text || empty.status,
        imageUrl: blobUrl || currentImageUrl || "",
      });
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [currentImageUrl]);
  return <div ref={root} className="rounded-card bg-tg-secondaryBg p-4 md:col-span-4"><p className="text-sm font-semibold">Previsualización móvil antes de guardar</p><div className="mx-auto mt-3 max-w-sm rounded-[2rem] border border-black/10 bg-tg-bg p-4 shadow-sm"><div className="flex gap-3"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-card bg-tg-secondaryBg">{preview.imageUrl ? <Image src={preview.imageUrl} alt="Vista previa del artículo" width={96} height={96} unoptimized className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7 text-tg-hint" />}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase text-tg-hint">{preview.category} · {preview.status}</p><h3 className="mt-1 break-words text-lg font-bold">{preview.title}</h3>{preview.price ? <p className="mt-2 font-bold">{preview.price}</p> : <p className="mt-2 text-xs text-tg-hint">Precio bajo consulta</p>}</div></div><p className="mt-3 whitespace-pre-wrap text-sm text-tg-hint">{preview.description}</p>{preview.terms ? <div className="mt-3 rounded-card bg-tg-secondaryBg p-3 text-sm"><strong>Condiciones</strong><p className="mt-1 whitespace-pre-wrap">{preview.terms}</p></div> : null}<div className="mt-3 rounded-card bg-tg-button px-4 py-2 text-center text-sm font-semibold text-tg-buttonText">{preview.cta}</div></div></div>;
}

function text(value: FormDataEntryValue | null) { return typeof value === "string" ? value.trim() : ""; }
