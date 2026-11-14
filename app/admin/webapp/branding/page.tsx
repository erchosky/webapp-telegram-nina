import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { saveBrandingSettings } from "@/lib/admin/webappActions";
import { listRows } from "@/lib/admin/webappData";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  await requireAdmin();
  const { data, error } = await listRows("webapp_settings", "id, key, value, is_public, description, created_at", 50);
  const branding = data.find((row) => row.key === "branding");
  const value = (branding?.value ?? { creatorName: "Nina" }) as Record<string, unknown>;
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <header><p className="text-sm text-tg-hint">Nombre público de marca usado por la MiniApp.</p><h1 className="text-3xl font-bold">Branding</h1></header>
      {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <form action={saveBrandingSettings} className="space-y-4 rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
          <label className="block"><span className="mb-1 block text-sm font-semibold">Nombre del creador o marca</span><input name="creatorName" required maxLength={80} defaultValue={String(value.creatorName ?? "Nina")} className="w-full rounded-card border border-black/10 p-3" /></label>
          <ImageUploadField name="logo_image_file" label="Logo público" currentUrl={typeof value.logoImageUrl === "string" ? value.logoImageUrl : null} removeName="remove_logo_image" />
          <Button pendingText="Subiendo y guardando...">Guardar branding</Button>
        </form>
        <aside className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5"><h2 className="font-semibold">Preview móvil</h2><div className="mt-4 min-h-60 rounded-[2rem] border border-black/10 bg-tg-bg p-5 shadow-sm"><p className="text-xs uppercase text-tg-hint">MiniApp</p><h2 className="mt-2 text-2xl font-bold">{String(value.creatorName ?? "Nina")}</h2></div></aside>
      </div>
    </main>
  );
}
