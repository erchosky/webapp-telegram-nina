"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyValueButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }
  return <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-borderSoft px-3 py-2 text-sm" aria-live="polite">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : label}</button>;
}
