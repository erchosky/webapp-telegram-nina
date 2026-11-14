"use client";

import { resolveContactTarget } from "@/lib/client/contact";
import { getWebApp } from "@/lib/telegram/webapp";

export interface PreparedContactResult {
  error: string | null;
  preview: string | null;
}

export function openPreparedContact({
  contact,
  message,
  isDevMock,
  invalidLabel,
  previewLabel,
}: {
  contact: string | null | undefined;
  message: string;
  isDevMock: boolean;
  invalidLabel: string;
  previewLabel: (url: string) => string;
}): PreparedContactResult {
  const target = resolveContactTarget(contact);
  const webApp = getWebApp();

  if (target.kind === "invalid") {
    webApp?.HapticFeedback?.notificationOccurred("error");
    return { error: invalidLabel, preview: null };
  }

  const url = target.url;

  if (isDevMock) {
    webApp?.HapticFeedback?.impactOccurred("light");
    return {
      error: null,
      preview: `${previewLabel(url)}\n\nMensaje listo para copiar:\n${message}`,
    };
  }

  if (target.kind === "telegram") {
    if (webApp) webApp.openTelegramLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  } else if (webApp) {
    webApp.openLink(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return {
    error: null,
    preview: target.kind === "telegram" ? `Mensaje listo para copiar:\n${message}` : null,
  };
}
