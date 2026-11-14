"use client";

import { useState } from "react";
import { existingMemberAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function ExistingMemberForm() {
  const [memberSince, setMemberSince] = useState("");
  const [endsAt, setEndsAt] = useState("");
  return <form action={existingMemberAction} className="grid gap-4 md:grid-cols-2">
    <label className="text-sm">Telegram ID<input name="telegramUserId" inputMode="numeric" required className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2"/></label>
    <label className="text-sm">Username de Telegram (opcional)<input name="telegramUsername" placeholder="@usuario" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2"/></label>
    <label className="text-sm">Miembro desde<input type="datetime-local" value={memberSince} onChange={(event) => setMemberSince(event.target.value)} required className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2"/></label>
    <label className="text-sm">Caduca el (opcional)<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2"/><span className="mt-1 block text-xs text-muted">Si lo dejas vacío, quedará como “requiere revisión manual”.</span></label>
    <input type="hidden" name="memberSince" value={memberSince ? new Date(memberSince).toISOString() : ""}/>
    <input type="hidden" name="endsAt" value={endsAt ? new Date(endsAt).toISOString() : ""}/>
    <label className="text-sm md:col-span-2">Notas internas<textarea name="internalNotes" rows={3} className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2"/></label>
    <div className="md:col-span-2"><Button>Guardar como miembro activo existente</Button></div>
  </form>;
}
