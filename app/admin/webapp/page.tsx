import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listOrderedRows, listRows } from "@/lib/admin/webappData";
import { cleanupOrphanedMarketplaceImages } from "@/lib/admin/webappActions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

const sections = [
  ["/admin/webapp/marketplace", "Marketplace", "Crear, editar, ocultar, vender, archivar y gestionar imágenes."],
  ["/admin/webapp/categories", "Categorías", "Crear, ordenar, ocultar y archivar categorías."],
  ["/admin/webapp/plans", "Planes", "Gestionar planes comerciales visibles en Supabase."],
  ["/admin/webapp/interests", "Intereses", "Revisar solicitudes y notas internas."],
  ["/admin/webapp/activity", "Actividad", "Auditar cambios, resultados y detalles administrativos."],
  ["/admin/webapp/branding", "Branding", "Editar textos públicos de marca."],
  ["/admin/webapp/home", "Home", "Editar contenido público de portada."],
] as const;

const quickActions = [
  ["/admin/webapp/marketplace#new-product", "Nuevo producto"],
  ["/admin/webapp/categories#new-category", "Nueva categoría"],
  ["/admin/webapp/home", "Editar Home"],
  ["/admin/webapp/branding", "Editar Branding"],
  ["/", "Ver MiniApp"],
] as const;

export default async function WebappAdminPage({ searchParams }: { searchParams: Promise<{ cleanup?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const [items, interests, plans, categories] = await Promise.all([
    listOrderedRows("marketplace_items", "id, status, public_visible", 500),
    listRows("purchase_interests", "id, status", 500),
    listOrderedRows("vip_plans", "id, status", 100),
    listOrderedRows("marketplace_categories", "id, status", 100),
  ]);
  const dashboardError = items.error || interests.error || plans.error || categories.error;
  const metrics = [
    ["Productos publicados", items.data.filter((row) => row.public_visible !== false && row.status !== "hidden" && row.status !== "archived").length],
    ["Productos vendidos", items.data.filter((row) => row.status === "sold").length],
    ["Productos archivados", items.data.filter((row) => row.status === "archived").length],
    ["Intereses pendientes", interests.data.filter((row) => row.status === "requested").length],
    ["Planes activos", plans.data.filter((row) => row.status === "published").length],
    ["Categorías activas", categories.data.filter((row) => row.status === "published").length],
  ] as const;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href="/admin" className="text-sm text-tg-button">Volver</Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-tg-hint">MiniApp pública, marketplace e intereses</p>
          <h1 className="text-3xl font-bold">Dashboard WebApp</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {quickActions.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-card bg-tg-button px-3 py-2 text-sm font-semibold text-tg-buttonText">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {process.env.NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS === "true" ? (
        <div className="rounded-card border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-700">
          Payment intents está activo, pero todavía no hay bandeja completa de resolución manual. Mantén revisión externa hasta Phase 2/3.
        </div>
      ) : null}
      {dashboardError ? (
        <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{dashboardError}</p>
      ) : null}
      {params.cleanup !== undefined ? <p className="rounded-card bg-emerald-50 p-3 text-sm text-emerald-800">Limpieza completada: {Number(params.cleanup) || 0} imágenes huérfanas eliminadas.</p> : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resumen rápido">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-card bg-tg-bg p-4 ring-1 ring-black/5">
            <p className="text-sm text-tg-hint">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(([href, title, body]) => (
          <Link key={href} href={href} className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-1 text-sm text-tg-hint">{body}</p>
          </Link>
        ))}
      </section>
      <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <h2 className="font-bold">Mantenimiento seguro de imágenes</h2>
        <p className="mt-1 text-sm text-tg-hint">Busca únicamente archivos creados por este CMS que ya no están referenciados. No toca contenido ajeno ni imágenes históricas aún vinculadas.</p>
        <form action={cleanupOrphanedMarketplaceImages} className="mt-3"><ConfirmSubmitButton message="¿Revisar y eliminar imágenes huérfanas gestionadas por el CMS?" className="rounded-card border border-black/10 px-3 py-2 text-sm font-semibold">Limpiar imágenes huérfanas</ConfirmSubmitButton></form>
      </section>
    </main>
  );
}
