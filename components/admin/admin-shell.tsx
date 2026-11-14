import Link from "next/link";
import { LayoutDashboard, Users, ScrollText, Settings, LogOut, ShieldCheck, Import, AlertTriangle } from "lucide-react";
import { logoutAction, logoutAllSessionsAction } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { dashboardTexts } from "@/lib/dashboard/texts";

const nav = [
  { href: "/admin", label: dashboardTexts.nav.dashboard, icon: LayoutDashboard },
  { href: "/admin/vip-guard/users", label: dashboardTexts.nav.users, icon: Users },
  { href: "/admin/vip-guard/migration", label: dashboardTexts.nav.migration, icon: Import },
  { href: "/admin/vip-guard/incidents", label: "Incidencias", icon: AlertTriangle },
  { href: "/admin/vip-guard/subscriptions", label: dashboardTexts.nav.subscriptions, icon: ShieldCheck },
  { href: "/admin/vip-guard/logs", label: dashboardTexts.nav.logs, icon: ScrollText },
  { href: "/admin/vip-guard/settings", label: dashboardTexts.nav.settings, icon: Settings }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 z-30 border-b border-borderSoft bg-panel/95 px-3 py-3 backdrop-blur lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:p-4">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div>
            <p className="text-lg font-semibold">{dashboardTexts.appName}</p>
            <p className="text-xs text-muted">{dashboardTexts.appTagline}</p>
          </div>
          <form action={logoutAction} className="lg:hidden">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-borderSoft px-3 py-2 text-sm text-muted hover:bg-panelSoft hover:text-ink" aria-label={dashboardTexts.nav.logout}>
              <LogOut className="h-4 w-4" />Salir
            </button>
          </form>
        </div>
        <nav aria-label="Navegación principal" className="mt-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] lg:mt-5 lg:grid lg:overflow-visible lg:pb-0">
          {nav.map(({href,label,icon:Icon}) => (
            <Link key={href} href={href} className="flex min-h-11 min-w-fit items-center gap-2 rounded-md border border-borderSoft/70 bg-black/10 px-3 py-2 text-sm text-muted hover:bg-panelSoft hover:text-ink lg:border-transparent lg:bg-transparent">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-5 hidden lg:block">
          <button className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-panelSoft hover:text-ink">
            <LogOut className="h-4 w-4" />{dashboardTexts.nav.logout}
          </button>
        </form>
        <form action={logoutAllSessionsAction} className="mt-2 hidden lg:block">
          <ConfirmSubmitButton message="¿Cerrar todas las sesiones admin, incluida esta?" className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger/10" formAction={logoutAllSessionsAction}>
            <ShieldCheck className="h-4 w-4" />Cerrar todas las sesiones
          </ConfirmSubmitButton>
        </form>
      </aside>
      <main className="w-full px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:p-8">
        <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
      </main>
    </div>
  );
}
