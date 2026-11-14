import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { positivePage } from "@/lib/admin/params";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function WebappActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const page = positivePage((await searchParams).page);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const result = await createAdminClient()
    .from("admin_audit_logs")
    .select("id, action, message, performed_by, metadata, created_at", { count: "exact" })
    .contains("metadata", { module: "webapp" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  const pageCount = Math.max(1, Math.ceil((result.count ?? 0) / pageSize));
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <Link href="/admin/webapp" className="text-sm text-tg-button">WebApp</Link>
    <header><p className="text-sm text-tg-hint">Quién cambió contenido, cuándo y con qué resultado.</p><h1 className="text-3xl font-bold">Actividad administrativa</h1></header>
    {result.error ? <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{result.error.message}</p> : null}
    <section className="space-y-3">{(result.data ?? []).map((row) => <article key={row.id} className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{row.message}</h2><p className="text-xs text-tg-hint">{row.action} · {row.performed_by || "admin"}</p></div><time className="text-xs text-tg-hint">{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(row.created_at))}</time></div>{row.metadata ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-tg-button">Ver detalles del cambio</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-card bg-tg-bg p-3 text-xs">{JSON.stringify(row.metadata, null, 2)}</pre></details> : null}</article>)}{!result.data?.length ? <p className="rounded-card border border-dashed border-black/20 p-4 text-sm">Todavía no hay actividad WebApp registrada.</p> : null}</section>
    <nav className="flex items-center justify-between text-sm"><span>Página {page} de {pageCount}</span><div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}`} className="rounded-card border border-black/10 px-3 py-2">Anterior</Link> : null}{page < pageCount ? <Link href={`?page=${page + 1}`} className="rounded-card border border-black/10 px-3 py-2">Siguiente</Link> : null}</div></nav>
  </main>;
}
