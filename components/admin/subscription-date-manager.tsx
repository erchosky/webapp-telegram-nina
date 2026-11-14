"use client";

import { useMemo, useState } from "react";
import { endDateAction, quickEndDateAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { quickExpiryPresetValues, quickSubscriptionEndDate, type QuickExpiryPreset } from "@/lib/subscription-dates";

const presetLabels: Record<QuickExpiryPreset, string> = {
  plus_1_month: "+1 mes",
  plus_2_months: "+2 meses",
  plus_3_months: "+3 meses",
  plus_15_days: "+15 días",
  plus_7_days: "+7 días"
};

const presets = quickExpiryPresetValues.map((value) => ({ value, label: presetLabels[value] }));

const formatDate = (date?: Date | string | null) => {
  if (!date) return "—";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid"
  }).format(parsed);
};

function isoFromLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function SubscriptionDateManager({
  userId,
  userName,
  status,
  currentEndsAt,
  currentUpdatedAt,
  nowIso
}: {
  userId: string;
  userName: string;
  status?: string | null;
  currentEndsAt?: string | null;
  currentUpdatedAt?: string | null;
  nowIso: string;
}) {
  const [reason, setReason] = useState("");
  const [manualDate, setManualDate] = useState("");
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const subscription = useMemo(() => ({ status, ends_at: currentEndsAt }), [status, currentEndsAt]);
  const manualIso = isoFromLocal(manualDate);

  const confirmChange = (newDateLabel: string) => {
    const message = [
      "¿Confirmas el cambio de caducidad?",
      "",
      `Usuario: ${userName}`,
      `Fecha actual: ${formatDate(currentEndsAt)}`,
      `Nueva fecha: ${newDateLabel}`,
      `Motivo: ${reason.trim() || "—"}`
    ].join("\n");
    return window.confirm(message);
  };

  return (
    <div className="mt-4 rounded-md border border-borderSoft bg-black/10 p-3">
      <p className="text-sm font-medium">Cambios rápidos de caducidad</p>
      <p className="mt-1 text-xs text-muted">
        Si está activo se suma desde la caducidad actual. Si está caducado o pendiente se suma desde ahora.
      </p>
      <label className="mt-3 block text-xs text-muted">
        Motivo opcional
        <input
          name="reasonPreview"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej. renovación pagada por Bizum, ajuste manual…"
          className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => {
          const preview = quickSubscriptionEndDate(preset.value, subscription, now);
          const previewLabel = formatDate(preview);
          return (
            <form
              key={preset.value}
              action={quickEndDateAction}
              onSubmit={(event) => {
                if (!confirmChange(previewLabel)) event.preventDefault();
              }}
              className="rounded-md border border-borderSoft p-2"
            >
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="preset" value={preset.value} />
              <input type="hidden" name="reason" value={reason} />
              <input type="hidden" name="expectedUpdatedAt" value={currentUpdatedAt ?? ""} />
              <Button size="sm" variant="secondary">{preset.label}</Button>
              <p className="mt-2 text-xs text-muted">Nueva caducidad: {previewLabel}</p>
            </form>
          );
        })}
      </div>
      <form
        action={endDateAction}
        onSubmit={(event) => {
          if (!manualIso || !confirmChange(formatDate(manualIso))) event.preventDefault();
        }}
        className="mt-3 flex flex-wrap items-end gap-2 border-t border-borderSoft pt-3"
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="endsAt" value={manualIso} />
        <input type="hidden" name="reason" value={reason} />
        <input type="hidden" name="expectedUpdatedAt" value={currentUpdatedAt ?? ""} />
        <label className="text-xs text-muted">
          Nueva caducidad manual
          <input
            value={manualDate}
            onChange={(event) => setManualDate(event.target.value)}
            type="datetime-local"
            required
            className="mt-1 block rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-sm text-ink"
          />
        </label>
        {manualIso ? <p className="pb-2 text-xs text-muted">Nueva caducidad: {formatDate(manualIso)}</p> : null}
        <Button size="sm" variant="secondary">Cambiar fecha</Button>
      </form>
    </div>
  );
}
