"use client";
import { userAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { dashboardTexts } from "@/lib/dashboard/texts";

export function ConfirmKickForm({ userId, name, returnTo = "/admin/vip-guard/users", activeUntil }: { userId: string; name: string; returnTo?: string; activeUntil?: string | null }) {
  return <form action={userAction} onSubmit={(event) => { if (!window.confirm(dashboardTexts.confirmations.kick(name))) event.preventDefault(); }} className="flex flex-wrap items-center gap-2"><input type="hidden" name="userId" value={userId}/><input type="hidden" name="action" value="kick"/><input type="hidden" name="returnTo" value={returnTo}/>{activeUntil ? <label className="text-xs text-muted">Activo hasta {new Date(activeUntil).toLocaleString("es-ES")}. Escribe EXPULSAR<input name="kick_confirmation" className="ml-2 w-28 rounded-md border border-borderSoft bg-black/20 px-2 py-1 text-xs text-ink" placeholder="EXPULSAR"/></label> : null}<input name="kick_reason" className="w-36 rounded-md border border-borderSoft bg-black/20 px-2 py-1 text-xs text-ink" placeholder="Motivo opcional"/><Button size="sm" variant="danger">{dashboardTexts.labels.kickNow}</Button></form>;
}
