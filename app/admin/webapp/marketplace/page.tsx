import type { CSSProperties } from "react";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { Button } from "@/components/ui/Button";
import { MarketplaceItemFormPreview } from "@/components/admin/MarketplaceItemFormPreview";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteItemImage, deleteRow, markItemImagePrimary, restoreRow, saveItem, saveItemImage } from "@/lib/admin/webappActions";
import { listOrderedRows, listRows } from "@/lib/admin/webappData";
import { positivePage } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const itemColumns =
  "id, category_id, title, description, visible_terms, price, currency, price_label, status, public_visible, " +
  "is_featured, sort_order, sold_visibility_until, requires_active_access, cta_label, " +
  "contact_intent, kind, delivery_type, created_at";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const [items, categories, images, interests] = await Promise.all([
    listOrderedRows("marketplace_items", itemColumns, 500),
    listOrderedRows("marketplace_categories", "id, title, status, sort_order", 100),
    listOrderedRows("marketplace_item_images", "id, item_id, storage_path, public_url, alt_text, mime_type, file_size_bytes, width, height, is_primary, sort_order, created_at", 1_000),
    listRows("purchase_interests", "id, item_id, status", 500),
  ]);
  const visibleCategories = categories.data.filter((row) => row.status !== "archived");
  const activeItems = items.data.filter((row) => row.status !== "archived");
  const q = params.q?.trim().toLocaleLowerCase("es") ?? "";
  const allowedStatus = new Set(["available", "reserved", "sold", "hidden"]);
  const selectedStatus = params.status && allowedStatus.has(params.status) ? params.status : "all";
  const filteredItems = activeItems.filter((row) => (!q || String(row.title ?? "").toLocaleLowerCase("es").includes(q)) && (selectedStatus === "all" || row.status === selectedStatus));
  const page = positivePage(params.page);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const archivedItems = items.data.filter((row) => row.status === "archived");
  const categoryById = new Map(visibleCategories.map((row) => [String(row.id), String(row.title ?? "Sin título")]));
  const imagesByItem = images.data.reduce<Map<string, Record<string, unknown>[]>>((acc, image) => {
    const itemId = image.item_id as string | undefined;
    if (!itemId) return acc;
    acc.set(itemId, [...(acc.get(itemId) ?? []), image]);
    return acc;
  }, new Map());
  const interestCountByItem = interests.data.reduce<Map<string, number>>((acc, interest) => {
    const itemId = interest.item_id as string | undefined;
    if (!itemId) return acc;
    acc.set(itemId, (acc.get(itemId) ?? 0) + 1);
    return acc;
  }, new Map());
  const pageError = items.error || categories.error || images.error || interests.error;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <PageHeader
        title="Marketplace"
        description="Productos, imágenes e intereses del catálogo WebApp."
        action={<Link href="#new-product" className="rounded-card bg-tg-button px-3 py-2 text-sm font-semibold text-tg-buttonText">Nuevo producto</Link>}
      />
      {pageError ? <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{pageError}</p> : null}
      <form method="get" className="flex flex-col gap-3 rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm"><span className="mb-1 block font-medium">Buscar producto</span><input name="q" defaultValue={params.q ?? ""} maxLength={100} className="w-full rounded-card border border-black/10 p-2" /></label><label className="text-sm"><span className="mb-1 block font-medium">Estado</span><select name="status" defaultValue={selectedStatus} className="rounded-card border border-black/10 p-2"><option value="all">Todos</option><option value="available">Disponible</option><option value="reserved">Reservado</option><option value="sold">Agotado/vendido</option><option value="hidden">Oculto</option></select></label><button className="min-h-11 rounded-card bg-tg-button px-4 py-2 font-semibold text-tg-buttonText">Filtrar</button><Link href="/admin/webapp/marketplace" className="min-h-11 rounded-card border border-black/10 px-4 py-2">Limpiar</Link></form>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen marketplace">
        <Metric label="Productos visibles" value={activeItems.filter((row) => row.public_visible !== false && row.status !== "hidden").length} />
        <Metric label="Vendidos" value={items.data.filter((row) => row.status === "sold").length} />
        <Metric label="Intereses registrados" value={interests.data.length} />
      </section>
      <details id="new-product" className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <summary className="cursor-pointer text-base font-semibold">Crear producto</summary>
        <p className="mt-1 text-sm text-tg-hint">Crea el producto con la misma información e imagen principal disponible en edición.</p>
        <ItemForm categories={visibleCategories} />
      </details>
      <section className="space-y-3" aria-label="Productos">
        <p className="text-sm text-tg-hint">{filteredItems.length} resultados · página {page} de {pageCount}</p>
        {visibleItems.map((row) => {
          const itemImages = imagesByItem.get(row.id as string) ?? [];
          const primaryImage = findPrimaryImage(itemImages);
          const categoryName = categoryById.get(String(row.category_id ?? "")) ?? "Sin categoría";
          return (
            <article key={row.id as string} className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
              <div className="grid gap-4 lg:grid-cols-[7rem_1fr_auto] lg:items-start">
                <ProductThumbnail image={primaryImage} title={String(row.title ?? "Producto")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-lg font-bold">{row.title as string}</h2>
                    <StatusBadge status={(row.status as string) ?? "available"} />
                    {row.requires_active_access === true ? <span className="rounded-full bg-black/10 px-2 py-1 text-xs">Requiere acceso activo</span> : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Precio" value={priceLabel(row)} />
                    <Field label="Categoría" value={categoryName} />
                    <Field label="Intereses" value={interestCountByItem.get(row.id as string) ?? 0} />
                    <Field label="Orden" value={String(row.sort_order ?? 100)} />
                  </dl>
                  <p className="mt-3 line-clamp-2 text-sm text-tg-hint">{(row.description as string) || "Sin descripción visible."}</p>
                  <ImagePath image={primaryImage} />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <a href={`#edit-${row.id as string}`} className="rounded-card border border-black/10 px-3 py-2 text-sm font-semibold">Editar</a>
                  <Link href="/" target="_blank" rel="noreferrer" className="rounded-card border border-black/10 px-3 py-2 text-sm font-semibold">Preview</Link>
                  <form action={deleteRow}>
                    <input type="hidden" name="table" value="marketplace_items" />
                    <input type="hidden" name="id" value={row.id as string} />
                    <ConfirmSubmitButton message="¿Archivar este producto?" className="rounded-card border border-red-200 px-3 py-2 text-sm font-semibold text-tg-destructive">Archivar</ConfirmSubmitButton>
                  </form>
                </div>
              </div>
              <details id={`edit-${row.id as string}`} className="mt-4 rounded-card bg-tg-bg p-4 ring-1 ring-black/5">
                <summary className="cursor-pointer font-semibold">Editar producto e imágenes</summary>
                <form action={saveItem} className="mt-4 grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="id" value={row.id as string} />
                  <Input name="title" defaultValue={row.title as string} label="Título" />
                  <CategorySelect rows={visibleCategories} defaultValue={(row.category_id as string) ?? ""} />
                  <StatusSelect defaultValue={(row.status as string) ?? "available"} />
                  <Input name="sort_order" defaultValue={String(row.sort_order ?? 100)} label="Orden" type="number" />
                  <Input name="description" defaultValue={(row.description as string) ?? ""} label="Descripción" />
                  <Input name="visible_terms" defaultValue={(row.visible_terms as string) ?? ""} label="Condiciones visibles" />
                  <Input name="price" defaultValue={String(row.price ?? "")} label="Precio" type="number" step="0.01" />
                  <Input name="currency" defaultValue={(row.currency as string) ?? "EUR"} label="Moneda" />
                  <Input name="price_label" defaultValue={(row.price_label as string) ?? ""} label="Etiqueta precio" />
                  <Input name="cta_label" defaultValue={(row.cta_label as string) ?? "Me interesa"} label="CTA" />
                  <Input name="contact_intent" defaultValue={(row.contact_intent as string) ?? ""} label="Intención" />
                  <Input name="sold_visibility_until" defaultValue={(row.sold_visibility_until as string) ?? ""} label="Vendido visible hasta" />
                  <Input name="kind" defaultValue={(row.kind as string) ?? "physical_piece"} label="Tipo" />
                  <Input name="delivery_type" defaultValue={(row.delivery_type as string) ?? "manual"} label="Entrega" />
                  <Input name="image_alt_text" defaultValue={(primaryImage?.alt_text as string) ?? String(row.title ?? "")} label="Texto alternativo de imagen" maxLength={180} />
                  <ImageUploadField currentUrl={(primaryImage?.public_url as string) ?? null} label="Sustituir imagen principal (opcional)" />
                  <Checkbox name="public_visible" defaultChecked={row.public_visible !== false} label="Visible" />
                  <Checkbox name="is_featured" defaultChecked={row.is_featured === true} label="Destacado" />
                  <Checkbox name="requires_active_access" defaultChecked={row.requires_active_access === true} label="Requiere acceso activo" />
                  <MarketplaceItemFormPreview currentImageUrl={(primaryImage?.public_url as string) ?? null} />
                  <Button pendingText="Subiendo y guardando...">Guardar producto</Button>
                </form>
                <ImageList itemId={row.id as string} images={itemImages} />
                <form action={saveItemImage} className="mt-4 grid gap-3 border-t border-black/10 pt-4 md:grid-cols-4">
                  <input type="hidden" name="item_id" value={row.id as string} />
                  <Input name="alt_text" label="Alt" />
                  <ImageUploadField label="Añadir imagen a la galería" />
                  <Checkbox name="is_primary" label="Principal" />
                  <Button variant="secondary" pendingText="Subiendo imagen...">Subir a la galería</Button>
                </form>
              </details>
            </article>
          );
        })}
        {visibleItems.length === 0 ? <EmptyState title="Sin productos activos" body="Crea el primer producto para empezar a ordenar el catálogo." /> : null}
      </section>
      <nav className="flex items-center justify-between text-sm"><span>Página {page} de {pageCount}</span><div className="flex gap-2">{page > 1 ? <Link href={marketplacePageHref(params, selectedStatus, page - 1)} className="rounded-card border border-black/10 px-3 py-2">Anterior</Link> : null}{page < pageCount ? <Link href={marketplacePageHref(params, selectedStatus, page + 1)} className="rounded-card border border-black/10 px-3 py-2">Siguiente</Link> : null}</div></nav>
      {archivedItems.length > 0 ? <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5"><h2 className="font-semibold">Productos archivados</h2><p className="mt-1 text-sm text-tg-hint">Se restauran ocultos y sin visibilidad pública. Los intereses históricos permanecen.</p><div className="mt-3 space-y-2">{archivedItems.map((row) => <article key={row.id as string} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tg-bg p-3"><div><p className="font-semibold">{row.title as string}</p><p className="text-xs text-tg-hint">{interestCountByItem.get(row.id as string) ?? 0} intereses históricos</p></div><form action={restoreRow}><input type="hidden" name="table" value="marketplace_items" /><input type="hidden" name="id" value={row.id as string} /><Button variant="secondary" pendingText="Restaurando...">Restaurar oculto</Button></form></article>)}</div></section> : null}
    </main>
  );
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-tg-hint">{description}</p>
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      {action}
    </header>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-tg-bg p-4 ring-1 ring-black/5">
      <p className="text-sm text-tg-hint">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-tg-hint">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = {
    available: "Disponible",
    reserved: "Reservado",
    sold: "Agotado / vendido",
    hidden: "Borrador / oculto",
    archived: "Archivado",
  }[status] ?? status;
  const tone = status === "sold" ? "bg-emerald-100 text-emerald-800" : status === "hidden" ? "bg-zinc-200 text-zinc-700" : "bg-blue-100 text-blue-800";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function ImageList({ itemId, images }: { itemId: string; images: Record<string, unknown>[] }) {
  if (images.length === 0) {
    return <EmptyState title="Sin imágenes" body="Se mostrará una imagen predeterminada. Puedes subir una imagen principal o una galería aquí." />;
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-black/10 pt-4 md:grid-cols-2">
      {images.map((image) => (
        <div key={image.id as string} className="grid gap-3 rounded-card bg-tg-secondaryBg p-3 text-sm ring-1 ring-black/10 sm:grid-cols-[5rem_1fr]">
          <ProductThumbnail image={image} title={(image.alt_text as string) || "Imagen de producto"} compact />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {image.is_primary ? <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">Principal</span> : <span className="rounded-full bg-black/10 px-2 py-1 text-xs">Secundaria</span>}
              <span className="text-xs text-tg-hint">orden {String(image.sort_order ?? 10)}</span>
              {image.width && image.height ? <span className="text-xs text-tg-hint">{String(image.width)} × {String(image.height)} px</span> : null}
            </div>
            <p className="mt-2 break-all text-xs text-tg-hint">{(image.public_url as string | null) || (image.storage_path as string | null) || "Imagen sin URL"}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {!image.is_primary && (
                <form action={markItemImagePrimary}>
                  <input type="hidden" name="item_id" value={itemId} />
                  <input type="hidden" name="image_id" value={image.id as string} />
                  <Button variant="ghost" size="sm" pendingText="Cambiando...">Marcar principal</Button>
                </form>
              )}
              <form action={deleteItemImage}>
                <input type="hidden" name="item_id" value={itemId} />
                <input type="hidden" name="image_id" value={image.id as string} />
                <ConfirmSubmitButton message="¿Borrar esta imagen?" className="text-sm font-semibold text-tg-destructive">Borrar imagen</ConfirmSubmitButton>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductThumbnail({ image, title, compact = false }: { image?: Record<string, unknown>; title: string; compact?: boolean }) {
  const publicUrl = typeof image?.public_url === "string" && image.public_url ? image.public_url : null;
  const storagePath = typeof image?.storage_path === "string" && image.storage_path ? image.storage_path : null;
  const style: CSSProperties | undefined = publicUrl ? { backgroundImage: `url("${publicUrl}")` } : undefined;
  return (
    <div
      aria-label={publicUrl ? title : undefined}
      className={`${compact ? "h-20" : "h-28"} overflow-hidden rounded-card bg-tg-bg ring-1 ring-black/10`}
    >
      {publicUrl ? (
        <div className="h-full w-full bg-cover bg-center" style={style} />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-tg-hint">
          {storagePath ? "Storage path" : "Sin imagen"}
        </div>
      )}
    </div>
  );
}

function ImagePath({ image }: { image?: Record<string, unknown> }) {
  if (!image) return null;
  const path = (image.public_url as string | null) || (image.storage_path as string | null);
  if (!path) return null;
  return <p className="mt-2 break-all text-xs text-tg-hint">{image.public_url ? "URL pública" : "Storage"}: {path}</p>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-black/20 bg-tg-bg p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-tg-hint">{body}</p>
    </div>
  );
}

function ItemForm({ categories }: { categories: Record<string, unknown>[] }) {
  return (
    <form action={saveItem} className="mt-4 grid gap-3 md:grid-cols-4">
      <Input name="title" label="Título" />
      <CategorySelect rows={categories} />
      <StatusSelect defaultValue="available" />
      <Input name="sort_order" label="Orden" type="number" defaultValue="100" />
      <Input name="description" label="Descripción" />
      <Input name="visible_terms" label="Condiciones visibles" />
      <Input name="price" label="Precio" type="number" step="0.01" />
      <Input name="currency" label="Moneda" defaultValue="EUR" />
      <Input name="price_label" label="Etiqueta precio" />
      <Input name="cta_label" label="CTA" defaultValue="Me interesa" />
      <Input name="contact_intent" label="Intención" />
      <Input name="image_alt_text" label="Texto alternativo de imagen" maxLength={180} />
      <ImageUploadField label="Imagen principal (opcional)" />
      <KindSelect />
      <DeliverySelect />
      <Checkbox name="public_visible" defaultChecked label="Visible" />
      <Checkbox name="is_featured" label="Destacado" />
      <Checkbox name="requires_active_access" label="Requiere acceso activo" />
      <MarketplaceItemFormPreview />
      <Button pendingText="Creando producto...">Crear producto</Button>
    </form>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input {...rest} placeholder={label} className="w-full rounded-card border border-black/10 p-2" />
    </label>
  );
}

function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-card border border-black/10 px-3 py-2 text-sm">
      <input {...rest} type="checkbox" /> {label}
    </label>
  );
}

function CategorySelect({ rows, defaultValue = "" }: { rows: Record<string, unknown>[]; defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Categoría</span>
      <select name="category_id" defaultValue={defaultValue} className="w-full rounded-card border border-black/10 p-2">
        <option value="">Sin categoría</option>
        {rows.map((row) => (
          <option key={row.id as string} value={row.id as string}>{row.title as string}</option>
        ))}
      </select>
    </label>
  );
}

function StatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Estado</span>
      <select name="status" defaultValue={defaultValue} className="w-full rounded-card border border-black/10 p-2">
        <option value="available">Disponible</option>
        <option value="reserved">Reservado</option>
        <option value="sold">Vendido</option>
        <option value="hidden">Borrador / oculto</option>
      </select>
    </label>
  );
}

function KindSelect() {
  return <label className="block text-sm"><span className="mb-1 block font-medium">Tipo</span><select name="kind" defaultValue="physical_piece" className="w-full rounded-card border border-black/10 p-2"><option value="physical_piece">Pieza física</option><option value="online_content">Contenido online</option><option value="custom_request">Solicitud personalizada</option><option value="wishlist">Wishlist</option><option value="promotion">Promoción</option></select></label>;
}

function DeliverySelect() {
  return <label className="block text-sm"><span className="mb-1 block font-medium">Entrega</span><select name="delivery_type" defaultValue="manual" className="w-full rounded-card border border-black/10 p-2"><option value="manual">Manual</option><option value="telegram">Telegram</option><option value="external">Externa</option></select></label>;
}

function findPrimaryImage(images: Record<string, unknown>[]) {
  return images.find((image) => image.is_primary === true) ?? images[0];
}

function priceLabel(row: Record<string, unknown>) {
  if (typeof row.price_label === "string" && row.price_label) return row.price_label;
  if (row.price === null || row.price === undefined || row.price === "") return "Sin precio";
  return `${String(row.price)} ${String(row.currency ?? "EUR")}`;
}

function marketplacePageHref(params: { q?: string }, status: string, page: number) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (status !== "all") next.set("status", status);
  next.set("page", String(page));
  return `/admin/webapp/marketplace?${next}`;
}
