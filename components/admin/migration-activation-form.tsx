"use client";
import { useState } from "react";
import { migrationActivationAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function MigrationActivationForm({ userId }: { userId: string }) {
  const [localDate, setLocalDate] = useState("");
  const isoDate = localDate ? new Date(localDate).toISOString() : "";
  return <form action={migrationActivationAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="userId" value={userId}/><input type="hidden" name="endsAt" value={isoDate}/><label className="text-xs text-muted">Acceso válido hasta<input value={localDate} onChange={(event)=>setLocalDate(event.target.value)} type="datetime-local" required className="mt-1 block rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm text-ink"/></label><Button>Activar con fecha exacta</Button></form>;
}
