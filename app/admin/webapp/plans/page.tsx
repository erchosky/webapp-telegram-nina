import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteRow, restoreRow, savePlan } from "@/lib/admin/webappActions";
import { listOrderedRows } from "@/lib/admin/webappData";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  await requireAdmin();
  const { data, error } = await listOrderedRows("vip_plans", "*", 100);
  const rows = data.filter((row) => row.status !== "archived");
  const archived = data.filter((row) => row.status === "archived");
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <PageHeader title="Planes VIP" description="Catálogo comercial visible en la WebApp." />
      <div className="rounded-card border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-700">
        Estos planes configuran el catálogo WebApp. La renovación/pagos pueden seguir usando configuración técnica hasta unificar fuente de verdad.
      </div>
      {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <h2 className="font-semibold">Crear plan</h2>
        <p className="mt-1 text-sm text-tg-hint">No cambia la lógica de pagos; solo ordena el catálogo que ve la WebApp.</p>
        <PlanForm />
      </section>
      <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Listado</h2>
          <span className="text-sm text-tg-hint">{rows.length} activos/no archivados</span>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id as string} className="rounded-card bg-tg-bg p-3 ring-1 ring-black/5">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_7rem_7rem_7rem_5rem_auto] lg:items-center">
                <Field label="Nombre" value={row.name as string} />
                <Field label="Precio" value={planPrice(row)} />
                <Field label="Duración" value={row.duration_days ? `${String(row.duration_days)} días` : "Sin duración"} />
                <Field label="Estado" value={<StatusBadge status={(row.status as string) ?? "published"} />} />
                <Field label="Orden" value={String(row.sort_order ?? 100)} />
                <form action={deleteRow} className="lg:text-right">
                  <input type="hidden" name="table" value="vip_plans" />
                  <input type="hidden" name="id" value={row.id as string} />
                  <ConfirmSubmitButton message="¿Archivar este plan?" className="rounded-card border border-red-200 px-3 py-2 text-sm font-semibold text-tg-destructive">Archivar</ConfirmSubmitButton>
                </form>
              </div>
              {row.description ? <p className="mt-2 text-sm text-tg-hint">{row.description as string}</p> : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-tg-button">Editar</summary>
                <form action={savePlan} className="mt-3 grid gap-3 md:grid-cols-6">
                  <input type="hidden" name="id" value={row.id as string} />
                  <Input name="name" label="Nombre" defaultValue={row.name as string} />
                  <Input name="description" label="Descripción" defaultValue={(row.description as string) ?? ""} />
                  <Input name="amount" label="Importe" type="number" step="0.01" defaultValue={String(row.amount ?? "")} />
                  <Input name="currency" label="Moneda" defaultValue={(row.currency as string) ?? "EUR"} />
                  <Input name="duration_days" label="Días" type="number" defaultValue={String(row.duration_days ?? "")} />
                  <Input name="sort_order" label="Orden" type="number" defaultValue={String(row.sort_order ?? 100)} />
                  <StatusSelect defaultValue={(row.status as string) ?? "published"} />
                  <label className="flex min-h-11 items-center gap-2 rounded-card border border-black/10 px-3 py-2 text-sm">
                    <input name="is_featured" type="checkbox" defaultChecked={row.is_featured === true} /> Destacado
                  </label>
                  <Button pendingText="Guardando plan...">Guardar</Button>
                </form>
              </details>
            </article>
          ))}
          {rows.length === 0 ? <EmptyState title="Sin planes activos" body="Crea un plan para mostrar opciones comerciales en la WebApp." /> : null}
        </div>
      </section>
      {archived.length > 0 ? <section className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5"><h2 className="font-semibold">Planes archivados</h2><p className="mt-1 text-sm text-tg-hint">Restaurar no modifica suscripciones existentes: los planes son catálogo, no la autoridad de acceso.</p><div className="mt-3 space-y-2">{archived.map((row) => <article key={row.id as string} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-tg-bg p-3"><span>{row.name as string}</span><form action={restoreRow}><input type="hidden" name="table" value="vip_plans" /><input type="hidden" name="id" value={row.id as string} /><Button variant="secondary" pendingText="Restaurando...">Restaurar oculto</Button></form></article>)}</div></section> : null}
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

function PlanForm() {
  return (
    <form action={savePlan} className="mt-4 grid gap-3 md:grid-cols-6">
      <Input name="name" label="Nombre" />
      <Input name="description" label="Descripción" />
      <Input name="amount" label="Importe" type="number" step="0.01" />
      <Input name="currency" label="Moneda" defaultValue="EUR" />
      <Input name="duration_days" label="Días" type="number" />
      <Input name="sort_order" label="Orden" type="number" defaultValue="100" />
      <label className="flex min-h-11 items-center gap-2 rounded-card border border-black/10 px-3 py-2 text-sm">
        <input name="is_featured" type="checkbox" /> Destacado
      </label>
      <Button pendingText="Creando plan...">Crear</Button>
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
  const label = { published: "Visible", hidden: "Oculto", archived: "Archivado" }[status] ?? status;
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

function StatusSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Estado</span>
      <select name="status" defaultValue={defaultValue} className="w-full rounded-card border border-black/10 p-2">
        <option value="published">Visible</option>
        <option value="hidden">Oculto</option>
      </select>
    </label>
  );
}

function planPrice(row: Record<string, unknown>) {
  if (row.amount === null || row.amount === undefined || row.amount === "") return "Sin precio";
  return `${String(row.amount)} ${String(row.currency ?? "EUR")}`;
}
