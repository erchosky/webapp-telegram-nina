import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-session";
import { CopyMigrationMessage } from "@/components/admin/copy-migration-message";
import { MigrationActivationForm } from "@/components/admin/migration-activation-form";
import { Card, SectionHeader } from "@/components/ui/Card";
import { ExistingMemberForm } from "@/components/admin/existing-member-form";
import { messagesFor } from "@/lib/telegram/messages";

export const dynamic = "force-dynamic";

const pageSize = 50;

function pageHref(page: number, q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  return `/admin/vip-guard/migration${params.size ? `?${params}` : ""}`;
}

export default async function MigrationPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const rawQuery = (params.q ?? "").trim();
  const search = rawQuery.replace(/[%,]/g, " ").trim();
  const numericSearch = /^\d+$/.test(search) ? search : null;
  const db = createAdminClient();
  let userQuery = db
    .from("telegram_users")
    .select("id,telegram_user_id,telegram_username,first_name,last_name,started_bot_at,subscriptions(id)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (search) {
    userQuery = userQuery.or([
      `telegram_username.ilike.%${search}%`,
      `first_name.ilike.%${search}%`,
      `last_name.ilike.%${search}%`,
      ...(numericSearch ? [`telegram_user_id.eq.${numericSearch}`] : [])
    ].join(","));
  }
  const [{ data, error, count }, reviewCount] = await Promise.all([
    userQuery.range(from, to),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("source", "migration").eq("status", "needs_manual_review")
  ]);
  if (error) throw error;
  if (reviewCount.error) throw reviewCount.error;
  const unlinked = (data ?? []).filter((user) => !user.subscriptions?.length);
  const hasNext = count ? to + 1 < count : false;
  const migrationMessage = messagesFor("es").existingGroupMigration("@TU_BOT");
  return <><SectionHeader title="Migración inicial" description="Primero pide a los miembros que escriban /start. Después búscalos por nombre o username y ponles su caducidad."/><Card className="mb-5 border-amber-400/30 bg-amber-400/10"><h2 className="font-semibold text-amber-200">Grupo existente: modo migración</h2><p className="mt-2 text-sm text-muted">Telegram no permite al bot listar automáticamente todos los miembros antiguos del grupo. El flujo recomendado para Nina es:</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted"><li>Publicar el mensaje de abajo en el Telegram VIP.</li><li>Esperar a que cada miembro haga <code>/start</code> en privado con el bot.</li><li>Buscarlo aquí por nombre o username.</li><li>Asignarle fecha de caducidad o dejarlo en revisión manual.</li></ol><p className="mt-3 text-sm text-muted">El Telegram ID queda como dato técnico, no como algo que tengas que usar a diario.</p><p className="mt-3 text-sm font-semibold text-amber-200">No actives la expulsión automática hasta terminar la revisión de migración.</p></Card><Card className="mb-5"><p className="text-sm text-muted">Miembros migrados sin revisar</p><p className="mt-2 text-3xl font-semibold text-amber-200">{reviewCount.count ?? 0}</p><p className="mt-1 text-xs text-muted">Son miembros guardados sin caducidad. No reciben enlace y no entran en autoexpulsión hasta que fijes una fecha.</p></Card><Card className="mb-5 border-accent/30"><h2 className="font-semibold">Mensaje para publicar en el Telegram VIP</h2><p className="mt-1 text-sm text-muted">Cópialo y pégalo en el grupo para que cada miembro se registre con sus datos de Telegram disponibles.</p><CopyMigrationMessage message={migrationMessage}/></Card><Card className="mb-5"><h2 className="font-semibold">Usuarios pendientes de asignación</h2><p className="mt-1 text-sm text-muted">Aquí aparecen las personas que ya hicieron /start pero aún no tienen acceso asignado. Busca por nombre o username.</p><form method="get" className="mt-4 flex gap-2"><input name="q" defaultValue={params.q} placeholder="Buscar por nombre o username" className="h-10 min-w-0 flex-1 rounded-md border border-borderSoft bg-panel px-3 text-sm outline-none focus:border-accent" /><button type="submit" className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-black">Buscar</button>{params.q ? <Link href="/admin/vip-guard/migration" className="inline-flex h-10 items-center px-3 text-sm text-muted hover:text-ink">Limpiar</Link> : null}</form></Card><details className="mb-5 rounded-xl border border-borderSoft bg-panel p-5"><summary className="cursor-pointer font-semibold">Soporte avanzado: añadir miembro por Telegram ID</summary><p className="mb-4 mt-3 text-sm text-muted">Úsalo solo si ya tienes el Telegram ID por soporte, exportación previa o diagnóstico. Para la operación normal, pide al usuario que haga /start y búscalo por nombre o username.</p><ExistingMemberForm/></details><div className="mb-4 flex items-center justify-between text-sm text-muted"><span>Página {page} · mostrando hasta {pageSize} usuarios</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1, params.q)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Anterior</Link> : null}{hasNext ? <Link href={pageHref(page + 1, params.q)} className="rounded-md border border-borderSoft px-3 py-2 hover:text-ink">Siguiente</Link> : null}</div></div><div className="space-y-4">{unlinked.map((user)=><Card key={user.id}><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.telegram_username || "Usuario sin nombre"}</h2><p className="mt-1 text-sm text-muted">{user.telegram_username ? `@${user.telegram_username}` : "Sin username"}</p><p className="mt-1 text-xs text-muted">Pendiente de asignación · Hizo /start: {user.started_bot_at ? new Date(user.started_bot_at).toLocaleString("es-ES") : "—"}</p><details className="mt-1 text-xs text-muted"><summary>Dato técnico</summary>Telegram ID {user.telegram_user_id}</details></div><MigrationActivationForm userId={user.id}/></div></Card>)}{!unlinked.length&&<Card><p className="text-sm text-muted">No quedan usuarios pendientes de asignación con esta búsqueda.</p></Card>}</div></>;
}
