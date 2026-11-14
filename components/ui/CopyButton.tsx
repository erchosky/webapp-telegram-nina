"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { getWebApp } from "@/lib/telegram/webapp";
import { cn } from "@/lib/client/cn";

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useTelegram();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for older webviews without the async clipboard API.
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    getWebApp()?.HapticFeedback?.impactOccurred("light");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-tg-secondaryBg px-3 py-2 text-sm font-medium text-tg-text",
        className,
      )}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? t.common.copied : t.common.copy}
    </button>
  );
}
