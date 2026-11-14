import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteRow, restoreRow, saveCategory } from "@/lib/admin/webappActions";
import { listOrderedRows } from "@/lib/admin/webappData";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireAdmin();
  const { data, error } = await listOrderedRows(
    "marketplace_categories",
    "id, slug, title, description, image_url, image_storage_path, image_alt_text, status, sort_order, created_at",
  );
  const rows = data.filter((row) => row.status !== "archived");
  const archived = data.filter((row) => row.status === "archived");
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <PageHeader title="Categorías" description="Orden y visibilidad de las secciones del catálogo." />
      {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section id="new-category" className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <h2 className="font-semibold">Crear categoría</h2>
        <p className="mt-1 text-sm text-tg-hint">Usa un slug corto en minúsculas para mantener URLs y payloads estables.</p>
        <CategoryForm />
      </section>
      <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Listado</h2>
          <span className="text-sm text-tg-hint">{rows.length} activas/no archivadas</span>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id as string} className="rounded-card bg-tg-bg p-3 ring-1 ring-black/5">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_7rem_5rem_auto] lg:items-center">
                <Field label="Nombre" value={row.title as string} />
                <Field label="Slug" value={<code className="break-all text-xs">{row.slug as string}</code>} />
                <Field label="Estado" value={<StatusBadge status={(row.status as string) ?? "published"} />} />
                <Field label="Orden" value={String(row.sort_order ?? 100)} />
                <form action={deleteRow} className="lg:text-right">
                  <input type="hidden" name="table" value="marketplace_categories" />
                  <input type="hidden" name="id" value={row.id as string} />
                  <ConfirmSubmitButton message="¿Archivar esta categoría?" className="rounded-card border border-red-200 px-3 py-2 text-sm font-semibold text-tg-destructive">Archivar</ConfirmSubmitButton>
                </form>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-tg-button">Editar</summary>
                <form action={saveCategory} className="mt-3 grid gap-3 md:grid-cols-6">
                  <input type="hidden" name="id" value={row.id as string} />
                  <Input name="slug" defaultValue={row.slug as string} label="Slug" />
                  <Input name="title" defaultValue={row.title as string} label="Título" />
                  <Input name="description" defaultValue={(row.description as string) ?? ""} label="Descripción" />
                  <input type="hidden" name="image_url" value={(row.image_url as string) ?? ""} />
                  <Input name="image_alt_text" defaultValue={(row.image_alt_text as string) ?? ""} label="Texto alternativo" maxLength={180} />
                  <ImageUploadField currentUrl={(row.image_url as string) ?? null} label="Sustituir imagen de categoría" removeName="remove_image" />
                  <Select name="status" defaultValue={(row.status as string) ?? "published"} />
                  <Input name="sort_order" defaultValue={String(row.sort_order ?? 100)} label="Orden" type="number" />
                  <Button pendingText="Guardando categoría...">Guardar</Button>
                </form>
              </details>
            </article>
          ))}
          {rows.length === 0 ? <EmptyState title="Sin categorías" body="Crea una categoría para agrupar los productos del marketplace." /> : null}
        </div>
      </section>
      {archived.length > 0 ? <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5"><h2 className="font-semibold">Archivadas</h2><p className="mt-1 text-sm text-tg-hint">Se restauran como borrador para evitar una publicación accidental.</p><div className="mt-3 space-y-2">{archived.map((row) => <article key={row.id as string} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tg-bg p-3"><span>{row.title as string}</span><form action={restoreRow}><input type="hidden" name="table" value="marketplace_categories" /><input type="hidden" name="id" value={row.id as string} /><Button variant="secondary" pendingText="Restaurando...">Restaurar como borrador</Button></form></article>)}</div></section> : null}
    </main>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <p className="text-sm text-tg-hint">{description}</p>
      <h1 className="text-3xl font-bold">{title}</h1>
    </header>
  );
}

function CategoryForm() {
  return (
    <form action={saveCategory} className="mt-4 grid gap-3 md:grid-cols-6">
      <Input name="slug" label="Slug" />
      <Input name="title" label="Título" />
      <Input name="description" label="Descripción" />
      <Input name="image_alt_text" label="Texto alternativo" maxLength={180} />
      <ImageUploadField label="Imagen de categoría (opcional)" />
      <Select name="status" defaultValue="published" />
      <Input name="sort_order" label="Orden" type="number" defaultValue="100" />
      <Button pendingText="Creando categoría...">Crear</Button>
    </form>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-tg-hint">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = { published: "Visible", hidden: "Oculta", draft: "Borrador", archived: "Archivada" }[status] ?? status;
  const tone = status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-black/20 bg-tg-bg p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-tg-hint">{body}</p>
    </div>
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

function Select({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Estado</span>
      <select name={name} defaultValue={defaultValue} className="w-full rounded-card border border-black/10 p-2">
        <option value="published">Visible</option>
        <option value="hidden">Oculta</option>
        <option value="draft">Borrador</option>
      </select>
    </label>
  );
}
