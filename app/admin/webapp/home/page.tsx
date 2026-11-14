import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { saveMarketplaceSettings } from "@/lib/admin/webappActions";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { Button } from "@/components/ui/Button";
import { listRows } from "@/lib/admin/webappData";

export const dynamic = "force-dynamic";

const defaults = {
  marketplaceHeadline: "Catálogo privado",
  marketplaceIntro: "Consulta contenido, piezas puntuales o solicitudes preparadas.",
  marketplaceHeaderImageUrl: "",
  marketplaceEmptyTitle: "Catálogo privado no disponible",
  marketplaceEmptyBody: "Ahora no hay piezas visibles. Puedes escribir por privado para consultar disponibilidad.",
  marketplaceAvailableLabel: "Bajo consulta",
  marketplaceReservedLabel: "Reservado",
  marketplaceSoldLabel: "Vendido",
};

export default async function HomePage() {
  await requireAdmin();
  const { data, error } = await listRows("webapp_settings", "id, key, value, is_public, description, created_at", 50);
  const row = data.find((entry) => entry.key === "marketplace") ?? data.find((entry) => entry.key === "home");
  const value = { ...defaults, ...((row?.value ?? {}) as Record<string, unknown>) };
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <header><p className="text-sm text-tg-hint">Personalización controlada del marketplace público.</p><h1 className="text-3xl font-bold">Home y marketplace</h1></header>
      {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <form action={saveMarketplaceSettings} className="grid gap-4 rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5 md:grid-cols-2">
          <Input name="marketplaceHeadline" label="Título del marketplace" value={value} />
          <input type="hidden" name="marketplaceHeaderImageUrl" value={String(value.marketplaceHeaderImageUrl ?? "")} />
          <ImageUploadField name="header_image_file" label="Cabecera del marketplace" currentUrl={String(value.marketplaceHeaderImageUrl ?? "") || null} removeName="remove_header_image" />
          <Textarea name="marketplaceIntro" label="Subtítulo / texto introductorio" value={value} />
          <Textarea name="marketplaceEmptyBody" label="Descripción de estado vacío" value={value} />
          <Input name="marketplaceEmptyTitle" label="Título de estado vacío" value={value} />
          <Input name="marketplaceAvailableLabel" label="Texto de disponible" value={value} />
          <Input name="marketplaceReservedLabel" label="Texto de reservado" value={value} />
          <Input name="marketplaceSoldLabel" label="Texto de agotado/vendido" value={value} />
          <Button className="md:col-span-2" pendingText="Subiendo y guardando...">Guardar personalización</Button>
        </form>
        <aside className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
          <h2 className="font-semibold">Preview móvil</h2>
          <div className="mt-4 min-h-80 rounded-[2rem] border border-black/10 bg-tg-bg p-5 shadow-sm">
            <p className="text-xs uppercase text-tg-hint">Marketplace</p>
            <h2 className="mt-2 text-2xl font-bold">{String(value.marketplaceHeadline)}</h2>
            <p className="mt-3 text-sm text-tg-hint">{String(value.marketplaceIntro)}</p>
            <div className="mt-6 rounded-card border border-dashed border-black/20 p-3"><p className="text-sm font-semibold">{String(value.marketplaceEmptyTitle)}</p><p className="mt-1 text-xs text-tg-hint">{String(value.marketplaceEmptyBody)}</p></div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Input({ name, label, value, required = true, type = "text" }: { name: keyof typeof defaults; label: string; value: Record<string, unknown>; required?: boolean; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><input name={name} type={type} required={required} defaultValue={String(value[name] ?? "")} className="w-full rounded-card border border-black/10 p-2" /></label>;
}

function Textarea({ name, label, value }: { name: keyof typeof defaults; label: string; value: Record<string, unknown> }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><textarea name={name} required defaultValue={String(value[name] ?? "")} className="min-h-24 w-full rounded-card border border-black/10 p-2" /></label>;
}
