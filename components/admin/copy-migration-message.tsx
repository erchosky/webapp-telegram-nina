"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function CopyMigrationMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2_000); }
  return <div className="mt-4 flex flex-col gap-2 sm:flex-row"><div className="flex-1 rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm">{message}</div><Button type="button" variant="secondary" onClick={copy}>{copied ? "Copiado" : "Copiar mensaje"}</Button></div>;
}
