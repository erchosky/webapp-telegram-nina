import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/admin-session";
import { loginAction } from "@/app/admin/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { dashboardTexts } from "@/lib/dashboard/texts";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  const errorMessage = error === "rate"
    ? "Demasiados intentos. Espera 15 minutos."
    : error === "config"
      ? "No se pudo crear la sesión admin. Revisa Supabase y variables de entorno."
      : error
        ? "No se pudo iniciar sesión. Revisa la contraseña."
        : null;
  return <main className="grid min-h-screen place-items-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]"><Card className="w-full max-w-sm p-6 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">{dashboardTexts.appName}</p><h1 className="mt-3 text-2xl font-semibold">{dashboardTexts.pages.loginTitle}</h1><p className="mt-2 text-sm text-muted">{dashboardTexts.pages.loginDescription}</p><form action={loginAction} className="mt-7 space-y-4" aria-describedby={errorMessage ? "login-error" : undefined}><label className="block text-sm" htmlFor="admin-password">Contraseña<input id="admin-password" name="password" type="password" required autoFocus autoComplete="current-password" className="mt-2 w-full rounded-md border border-borderSoft bg-black/20 px-3 py-3 text-base outline-none focus:border-accent sm:text-sm" /></label>{errorMessage ? <p id="login-error" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{errorMessage}</p> : null}<Button className="w-full" pendingText="Entrando…">Entrar al panel</Button></form><p className="mt-5 text-xs text-muted">Si pierdes acceso, rota `ADMIN_PASSWORD` en Vercel y redeploya.</p></Card></main>;
}
