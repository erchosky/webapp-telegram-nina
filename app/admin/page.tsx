import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <p className="text-sm text-tg-hint">FUSION admin</p>
        <h1 className="text-3xl font-bold">Selector de espacios</h1>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        <AdminLink href="/admin/vip-guard" title="VIP Guard" body="Usuarios, suscripciones, expiraciones, pagos, logs, settings y health." />
        <AdminLink href="/admin/webapp" title="WebApp" body="Branding, home, marketplace, planes, intereses y contenido." />
      </section>
    </main>
  );
}

function AdminLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-card bg-tg-secondaryBg p-4 ring-1 ring-black/5">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-tg-hint">{body}</p>
    </Link>
  );
}
