import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { Button } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin/auth";
import { updateInterest } from "@/lib/admin/webappActions";
import { listAdminInterests, listOrderedRows } from "@/lib/admin/webappData";
import { positivePage } from "@/lib/admin/params";

export const dynamic = "force-dynamic";

const filters = [
  ["all", "Todos"],
  ["requested", "Pendientes"],
  ["seen", "Contactados"],
  ["in_review", "En revisión"],
  ["resolved", "Cerrados"],
  ["cancelled", "Cancelados"],
] as const;

type InterestParams = { status?: string; q?: string; category?: string; item?: string; from?: string; to?: string; page?: string };

export default async function InterestsPage({ searchParams }: { searchParams: Promise<InterestParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const selected = filters.some(([value]) => value === params.status) ? params.status ?? "all" : "all";
  const page = positivePage(params.page);
  const [result, categoryRows, itemRows] = await Promise.all([
    listAdminInterests({ status: selected, q: params.q, categoryId: params.category, itemId: params.item, from: params.from, to: params.to, page, pageSize: 25 }),
    listOrderedRows("marketplace_categories", "id, title, status, sort_order", 500),
    listOrderedRows("marketplace_items", "id, title, status, sort_order", 1_000),
  ]);
  const rows = result.data;
  const pageCount = Math.max(1, Math.ceil(result.count / 25));
  const error = result.error || categoryRows.error || itemRows.error;
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
      <PageHeader title="Intereses" description="Solicitudes del marketplace para revisar y cerrar manualmente." />
      {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form method="get" className="grid gap-3 rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5 md:grid-cols-3">
        <label className="text-sm"><span className="mb-1 block font-medium">Buscar usuario o mensaje</span><input name="q" defaultValue={params.q ?? ""} maxLength={100} className="w-full rounded-card border border-black/10 p-2" /></label>
        <FilterSelect name="category" label="Categoría histórica" value={params.category} rows={categoryRows.data} />
        <FilterSelect name="item" label="Artículo" value={params.item} rows={itemRows.data} />
        <label className="text-sm"><span className="mb-1 block font-medium">Desde</span><input name="from" type="date" defaultValue={params.from ?? ""} className="w-full rounded-card border border-black/10 p-2" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Hasta</span><input name="to" type="date" defaultValue={params.to ?? ""} className="w-full rounded-card border border-black/10 p-2" /></label>
        {selected !== "all" ? <input type="hidden" name="status" value={selected} /> : null}
        <div className="flex items-end gap-2"><button className="min-h-11 rounded-card bg-tg-button px-4 py-2 font-semibold text-tg-buttonText">Filtrar</button><Link href="/admin/webapp/interests" className="min-h-11 rounded-card border border-black/10 px-4 py-2">Limpiar</Link></div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-tg-hint"><span>{result.count} solicitudes · página {page} de {pageCount}</span><a href={exportHref(params, selected)} className="rounded-card border border-black/10 bg-tg-bg px-3 py-2 font-semibold text-tg-button">Exportar CSV filtrado</a></div>
      <nav className="flex flex-wrap gap-2 text-sm">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={filterHref(value, params)}
            className={`rounded-card border border-black/10 px-3 py-2 ${selected === value ? "bg-tg-button text-tg-buttonText" : "bg-tg-bg text-tg-hint"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="space-y-3">
        {rows.map((row) => {
          const item = relationOne(row.marketplace_items);
          const category = relationOne(row.marketplace_categories);
          const itemTitle = item && typeof item === "object" && "title" in item ? String(item.title ?? row.item_id ?? "Producto") : String(row.item_id ?? "Producto");
          const categoryTitle = category && typeof category === "object" && "title" in category ? String(category.title ?? "Sin categoría") : "Sin categoría";
          const username = row.telegram_username as string | null;
          const displayUser = (row.user_name as string | null) || (username ? `@${username}` : "Usuario sin nombre");
          return (
            <article key={row.id as string} className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-lg font-bold">{displayUser}</h2>
                    <StatusBadge status={(row.status as string) ?? "requested"} />
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <Field label="Username" value={username ? `@${username}` : "Sin username"} />
                    <Field label={<strong>Producto:</strong>} value={itemTitle} />
                    <Field label={<strong>Categoría:</strong>} value={categoryTitle} />
                    <Field label="Fecha" value={fmtDate(row.created_at as string)} />
                    <Field label="Contacto Telegram" value={<TelegramContact username={username} id={row.telegram_user_numeric_id} />} />
                    <Field label="Telegram ID" value={String(row.telegram_user_numeric_id ?? "—")} />
                  </dl>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <TextBlock label="Mensaje" value={(row.message as string) || "Sin mensaje"} />
                    <TextBlock label="Metadata" value={formatMetadata(row.metadata)} mono />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-56 lg:justify-end">
                  <QuickInterestAction id={row.id as string} status="seen" notes={(row.internal_notes as string) ?? ""} label="Marcar contactado" />
                  <QuickInterestAction id={row.id as string} status="resolved" notes={(row.internal_notes as string) ?? ""} label="Cerrar" />
                  <QuickInterestAction id={row.id as string} status="cancelled" notes={(row.internal_notes as string) ?? ""} label="Cancelar" confirm="¿Cancelar este interés?" />
                </div>
              </div>
              <details className="mt-4 rounded-card bg-tg-bg p-3 ring-1 ring-black/5">
                <summary className="cursor-pointer text-sm font-semibold text-tg-button">Editar estado y nota</summary>
                <form action={updateInterest} className="mt-3 grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="id" value={row.id as string} />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Estado</span>
                    <select name="status" defaultValue={(row.status as string) ?? "seen"} className="w-full rounded-card border border-black/10 p-2">
                      <option value="requested">Solicitado</option>
                      <option value="seen">Contactado</option>
                      <option value="in_review">En revisión</option>
                      <option value="resolved">Cerrado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="mb-1 block font-medium">Notas internas</span>
                    <input
                      name="internal_notes"
                      defaultValue={(row.internal_notes as string) ?? ""}
                      placeholder="Notas internas"
                      className="w-full rounded-card border border-black/10 p-2"
                    />
                  </label>
                  <button className="rounded-card bg-tg-button px-3 py-2 font-semibold text-tg-buttonText">Actualizar</button>
                </form>
              </details>
            </article>
          );
        })}
        {rows.length === 0 ? <EmptyState title="Sin intereses en este filtro" body="Cuando llegue una solicitud del marketplace aparecerá aquí." /> : null}
      </section>
      <nav className="flex items-center justify-between text-sm"><span>Página {page} de {pageCount}</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(params, selected, page - 1)} className="rounded-card border border-black/10 px-3 py-2">Anterior</Link> : null}{page < pageCount ? <Link href={pageHref(params, selected, page + 1)} className="rounded-card border border-black/10 px-3 py-2">Siguiente</Link> : null}</div></nav>
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

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-tg-hint">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-card bg-tg-bg p-3 text-sm ring-1 ring-black/5">
      <p className="text-xs font-semibold uppercase text-tg-hint">{label}</p>
      <p className={`mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = {
    requested: "Pendiente",
    seen: "Contactado",
    in_review: "En revisión",
    resolved: "Cerrado",
    cancelled: "Cancelado",
  }[status] ?? status;
  const tone = status === "requested" ? "bg-amber-100 text-amber-800" : status === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function QuickInterestAction({ id, status, notes, label, confirm }: { id: string; status: string; notes: string; label: string; confirm?: string }) {
  const className = "rounded-card border border-black/10 bg-tg-bg px-3 py-2 text-sm font-semibold";
  return (
    <form action={updateInterest}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="internal_notes" value={notes} />
      {confirm ? <ConfirmSubmitButton message={confirm} className={className}>{label}</ConfirmSubmitButton> : <Button variant="secondary" pendingText="Actualizando...">{label}</Button>}
    </form>
  );
}

function TelegramContact({ username, id }: { username?: string | null; id: unknown }) {
  const cleanUsername = username?.trim().replace(/^@/, "") ?? "";
  if (/^[A-Za-z0-9_]{5,32}$/.test(cleanUsername)) {
    return <a className="text-tg-button" href={`https://t.me/${cleanUsername}`} target="_blank" rel="noreferrer">@{cleanUsername}</a>;
  }
  return <span>{id ? `ID ${String(id)}` : "No disponible"}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-black/20 bg-tg-bg p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-tg-hint">{body}</p>
    </div>
  );
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function filterHref(status: string, current: InterestParams) {
  const next = filterParams(current);
  next.delete("page");
  if (status === "all") next.delete("status"); else next.set("status", status);
  return `/admin/webapp/interests${next.size ? `?${next}` : ""}`;
}

function pageHref(current: InterestParams, status: string, page: number) {
  const next = filterParams(current);
  if (status !== "all") next.set("status", status);
  next.set("page", String(page));
  return `/admin/webapp/interests?${next}`;
}

function exportHref(current: InterestParams, status: string) {
  const next = filterParams(current);
  next.delete("page");
  if (status !== "all") next.set("status", status);
  return `/api/admin/webapp/interests/export${next.size ? `?${next}` : ""}`;
}

function filterParams(current: InterestParams) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "item", "from", "to", "status"] as const) if (current[key]) params.set(key, current[key]!);
  return params;
}

function FilterSelect({ name, label, value, rows }: { name: string; label: string; value?: string; rows: Record<string, unknown>[] }) {
  return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><select name={name} defaultValue={value ?? ""} className="w-full rounded-card border border-black/10 p-2"><option value="">Todos</option>{rows.map((row) => <option key={row.id as string} value={row.id as string}>{String(row.title ?? "Sin título")}{row.status === "archived" ? " (archivado)" : ""}</option>)}</select></label>;
}

function fmtDate(value?: string | null) {
  return value ? `${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value))} (Madrid)` : "—";
}

function formatMetadata(value: unknown) {
  if (!value || (typeof value === "object" && Object.keys(value).length === 0)) return "Sin metadata";
  return JSON.stringify(value, null, 2);
}
