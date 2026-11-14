"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, Lock, MessageCircle, Store, X } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import { useTelegram } from "@/components/TelegramProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { openPreparedContact } from "@/lib/client/openPreparedContact";
import { getAccessState } from "@/lib/client/subscriptionState";
import {
  categoryById,
  type MarketplaceCatalog,
  type MarketplaceItem,
  type MarketplaceItemStatus,
} from "@/lib/marketplace/catalog";
import {
  buildMarketplaceInterest,
  buildMarketplaceInterestRequest,
} from "@/lib/marketplace/interest";
import { buildCatalogMessage } from "@/lib/messages/catalog";
import { buildSupportMessage } from "@/lib/messages/support";
import { useResource } from "@/lib/client/useResource";
import { apiFetch } from "@/lib/client/api";
import { LoadingState } from "@/components/ui/States";
import { CopyButton } from "@/components/ui/CopyButton";

export function MarketplaceScreen({
  me,
  meError,
  onRetryMe,
}: {
  me: MeDTO | null;
  meError?: string | null;
  onRetryMe?: () => void;
}) {
  const { t, isDevMock, user } = useTelegram();
  const [preview, setPreview] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const interestSubmissionInFlight = useRef(false);
  const hasActiveAccess = me ? getAccessState(me) === "active" : false;
  const loader = useCallback((signal: AbortSignal) => loadMarketplace(signal), []);
  const catalog = useResource(loader, "No se pudo cargar el privado.");
  const marketplace = catalog.data;
  const hasVisibleCatalog =
    !!marketplace && marketplace.visibleCategories.length > 0 && marketplace.visibleItems.length > 0;

  async function askForProduct(item: MarketplaceItem) {
    setPreview(null);
    setFallbackMessage(null);
    setError(null);
    setSuccess(null);
    if (!marketplace) return;
    if (!me) {
      setError(meError ?? "No se pudo verificar tu sesión para registrar el interés. Reintenta tu estado VIP.");
      return;
    }
    const category = categoryById(marketplace, item.categoryId);
    if (!category) {
      setError("Este producto no está disponible ahora mismo. Reabre el privado o consulta por contacto.");
      return;
    }
    const interest = buildMarketplaceInterest({ item, category, me });
    const message = buildCatalogMessage({
      item,
      category,
      me,
      telegramUser: user,
      creatorName: marketplace.settings.creatorName,
      interest,
    });

    if (interestSubmissionInFlight.current) return;
    interestSubmissionInFlight.current = true;
    setBusyItemId(item.id);
    try {
      await apiFetch("/api/marketplace/interest", {
        method: "POST",
        body: buildMarketplaceInterestRequest(item.id, message),
      });
      setSuccess("Interés registrado. Si Telegram no abre el chat, copia el mensaje de abajo y envíamelo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el interés.");
      return;
    } finally {
      interestSubmissionInFlight.current = false;
      setBusyItemId(null);
    }

    const result = openPreparedContact({
      contact: me.group?.adminContact,
      isDevMock,
      invalidLabel: t.renew.contactInvalid,
      previewLabel: t.renew.contactPreview,
      message,
    });
    setError(result.error);
    setPreview(result.preview);
    setFallbackMessage(message);
  }

  function askForCatalog() {
    setPreview(null);
    setFallbackMessage(null);
    setError(null);
    setSuccess(null);
    const contact = me?.group?.adminContact ?? process.env.NEXT_PUBLIC_ADMIN_CONTACT;
    const fallbackMe = me ?? {
      language: "es" as const,
      user: { firstName: user?.first_name ?? null, username: user?.username ?? null, streakMonths: 0 },
      subscription: null,
      group: { publicName: null, adminContact: contact ?? null, paymentInstructions: null, renewalText: null, supportText: null },
      hasOpenPaymentIntent: false,
      paymentIntent: null,
    };
    const message = buildSupportMessage({
      intent: "catalog",
      me: fallbackMe,
      telegramUser: user,
      creatorName: marketplace?.settings.creatorName ?? "Nina",
    });
    const result = openPreparedContact({
      contact,
      isDevMock,
      invalidLabel: t.renew.contactInvalid,
      previewLabel: t.renew.contactPreview,
      message,
    });
    setError(result.error);
    setPreview(result.preview);
    setFallbackMessage(message);
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        {marketplace?.settings.headerImageUrl && (
          <Image
            src={marketplace.settings.headerImageUrl}
            alt="Cabecera del marketplace"
            width={960}
            height={320}
            className="mb-3 h-32 w-full rounded-card object-cover"
          />
        )}
        <div className="flex items-center gap-2">
          {marketplace?.settings.logoImageUrl ? <Image src={marketplace.settings.logoImageUrl} alt="Logo" width={40} height={40} className="h-10 w-10 rounded-full object-cover" /> : <Store className="h-5 w-5 text-tg-button" />}
          <CardTitle>{marketplace?.settings.headline ?? "Privado disponible"}</CardTitle>
        </div>
        <p className="text-sm leading-relaxed text-tg-hint">
          {marketplace?.settings.intro ?? "Mira contenido, piezas puntuales o solicitudes bajo consulta. Todo se confirma por privado."}
        </p>
      </Card>

      {catalog.loading && !marketplace ? (
        <LoadingState label="Cargando privado..." />
      ) : catalog.error ? (
        <Card className="space-y-2 text-center">
          <CardTitle>No se pudo cargar el privado</CardTitle>
          <p className="text-sm leading-relaxed text-tg-hint">{catalog.error}</p>
          <Button variant="secondary" onClick={catalog.reload}>Reintentar</Button>
        </Card>
      ) : hasVisibleCatalog ? (
        <>
          <section className="grid grid-cols-2 gap-2">
            {marketplace.visibleCategories.map((category) => (
              <Card key={category.id} className="min-h-28">
                {category.imageUrl && (
                  <Image src={category.imageUrl} alt="" width={320} height={120} className="mb-2 h-20 w-full rounded-card object-cover" />
                )}
                <CardTitle>{category.title}</CardTitle>
                <p className="text-sm leading-relaxed text-tg-hint">{category.description}</p>
              </Card>
            ))}
          </section>

          <div className="space-y-2">
            {marketplace.visibleItems.map((item) => {
              const category = categoryById(marketplace, item.categoryId);
              const gated = item.requiresActiveAccess && !hasActiveAccess;
              return (
                <Card key={item.id} className="space-y-3">
                  <div className="flex gap-3">
                    <ProductMedia item={item} categoryLabel={category?.title ?? "Privado disponible"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{item.title}</CardTitle>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-tg-hint">{item.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-normal text-tg-hint">
                          {category?.title ?? "Privado disponible"}
                        </span>
                        <StatusBadge status={item.status} settings={marketplace.settings} />
                      </div>
                    </div>
                    {item.priceLabel && <p className="shrink-0 text-right font-bold">{item.priceLabel}</p>}
                  </div>
                  {gated && (
                    <p className="flex items-center gap-2 rounded-card bg-tg-secondaryBg p-3 text-sm text-tg-hint">
                      <Lock className="h-4 w-4 shrink-0" />
                      Consulta manual para usuarios con acceso activo. Si no estás dentro, se revisa por privado.
                    </p>
                  )}
                  <Button variant="secondary" onClick={() => setSelectedItem(item)}>
                    Ver detalle
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => askForProduct(item)}
                    loading={busyItemId === item.id}
                    disabled={busyItemId !== null}
                  >
                    <MessageCircle className="h-5 w-5" />
                    {busyItemId === item.id
                      ? "Registrando..."
                      : gated
                        ? `Consultar acceso con ${marketplace.settings.creatorName}`
                        : item.ctaLabel}
                  </Button>
                  {!me && (
                    <Button variant="secondary" onClick={onRetryMe}>
                      Reintentar estado VIP
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="space-y-2 text-center">
          <CardTitle>{marketplace?.settings.emptyTitle ?? "No hay nada visible ahora"}</CardTitle>
          <p className="text-sm leading-relaxed text-tg-hint">
            {marketplace?.settings.emptyBody ?? "Ahora no hay piezas visibles. Escríbeme por privado y te digo qué hay disponible."}
          </p>
          <Button variant="secondary" onClick={askForCatalog}>
            <MessageCircle className="h-5 w-5" />
            Consultar por privado
          </Button>
        </Card>
      )}

      {error && <p className="text-center text-sm text-tg-destructive">{error}</p>}
      {success && <p className="text-center text-sm text-green-700">{success}</p>}
      {fallbackMessage && (
        <Card className="space-y-3">
          <CardTitle>Texto listo para copiar</CardTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-tg-hint">
            {fallbackMessage}
          </p>
          <CopyButton value={fallbackMessage} className="min-h-11 justify-center rounded-card" />
        </Card>
      )}
      {preview && <p className="whitespace-pre-wrap text-center text-sm text-tg-hint">{preview}</p>}
      {selectedItem && marketplace && (
        <ItemDetail
          item={selectedItem}
          categoryLabel={categoryById(marketplace, selectedItem.categoryId)?.title ?? "Marketplace"}
          statusLabel={statusLabel(selectedItem.status, marketplace.settings)}
          onClose={() => setSelectedItem(null)}
          onInterest={() => askForProduct(selectedItem)}
          busy={busyItemId === selectedItem.id}
        />
      )}
    </div>
  );
}

async function loadMarketplace(signal: AbortSignal): Promise<MarketplaceCatalog> {
  const res = await fetch("/api/marketplace", { signal, cache: "no-store" });
  const body = await res.json() as {
    ok: boolean;
    data?: MarketplaceCatalog;
    error?: { message?: string };
  };
  if (!res.ok || !body.ok || !body.data) {
    throw new Error(body.error?.message ?? "No se pudo cargar el privado.");
  }
  return body.data;
}

function ProductMedia({
  item,
  categoryLabel,
}: {
  item: MarketplaceItem;
  categoryLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = failed ? null : item.imageUrl;

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-tg-secondaryBg ring-1 ring-black/5">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={item.imageAlt ?? item.title}
          width={80}
          height={80}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-tg-hint">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[10px] font-semibold leading-tight">{categoryLabel}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, settings }: { status: MarketplaceItemStatus; settings: MarketplaceCatalog["settings"] }) {
  const copy: Record<MarketplaceItemStatus, string> = {
    available: settings.availableLabel,
    reserved: settings.reservedLabel,
    sold: settings.soldLabel,
    hidden: "Oculto",
    archived: "Archivado",
  };
  const tone: Record<MarketplaceItemStatus, string> = {
    available: "bg-green-100 text-green-700",
    reserved: "bg-amber-100 text-amber-700",
    sold: "bg-zinc-200 text-zinc-600",
    hidden: "bg-tg-secondaryBg text-tg-hint",
    archived: "bg-tg-secondaryBg text-tg-hint",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>
      {copy[status]}
    </span>
  );
}

function statusLabel(status: MarketplaceItemStatus, settings: MarketplaceCatalog["settings"]) {
  if (status === "available") return settings.availableLabel;
  if (status === "reserved") return settings.reservedLabel;
  if (status === "sold") return settings.soldLabel;
  return status === "hidden" ? "Oculto" : "Archivado";
}

function ItemDetail({
  item,
  categoryLabel,
  statusLabel: currentStatusLabel,
  onClose,
  onInterest,
  busy,
}: {
  item: MarketplaceItem;
  categoryLabel: string;
  statusLabel: string;
  onClose: () => void;
  onInterest: () => void;
  busy: boolean;
}) {
  return (
    <section role="dialog" aria-modal="true" aria-labelledby="marketplace-detail-title" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto mt-8 max-w-lg space-y-4 rounded-card bg-tg-bg p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-tg-hint">{categoryLabel} · {currentStatusLabel}</p>
            <h2 id="marketplace-detail-title" className="mt-1 text-2xl font-bold">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="rounded-full p-2 ring-1 ring-black/10"><X className="h-5 w-5" /></button>
        </div>
        <ProductMedia item={item} categoryLabel={categoryLabel} />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-tg-hint">{item.description}</p>
        {item.visibleTerms && (
          <div className="rounded-card bg-tg-secondaryBg p-3">
            <p className="text-xs font-semibold uppercase text-tg-hint">Condiciones</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.visibleTerms}</p>
          </div>
        )}
        {item.priceLabel && <p className="text-xl font-bold">{item.priceLabel}</p>}
        <Button onClick={onInterest} loading={busy} disabled={busy}>
          <MessageCircle className="h-5 w-5" />
          {busy ? "Registrando..." : item.ctaLabel}
        </Button>
      </div>
    </section>
  );
}
