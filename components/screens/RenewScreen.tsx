"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, MessageCircle, ShieldCheck } from "lucide-react";
import type { MeDTO, PaymentIntentDTO } from "@/lib/api/dto";
import { useTelegram } from "@/components/TelegramProvider";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/client/api";
import { openPreparedContact } from "@/lib/client/openPreparedContact";
import { getWebApp } from "@/lib/telegram/webapp";
import { cn } from "@/lib/client/cn";
import { appConfig } from "@/lib/config/app";
import { buildAccessMessage } from "@/lib/messages/access";
import { getAccessState } from "@/lib/client/subscriptionState";

export function RenewScreen({
  me,
  onRequested,
}: {
  me: MeDTO;
  onRequested: () => void;
}) {
  const { t, language } = useTelegram();
  const { brand, features, plans } = appConfig;
  const recommendedPlan = plans.all.find((plan) => plan.highlighted) ?? plans.all[0];
  const [selectedPlanId, setSelectedPlanId] = useState<string>(recommendedPlan.id);
  const [submitting, setSubmitting] = useState(false);
  const [justRequested, setJustRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyOpen = features.paymentIntents && (me.hasOpenPaymentIntent || justRequested);
  const selectedPlan = plans.findById(selectedPlanId);
  const instructions = me.group?.renewalText || me.group?.paymentInstructions;
  const adminContact = me.group?.adminContact || process.env.NEXT_PUBLIC_ADMIN_CONTACT || null;
  const accessState = getAccessState(me);
  const isActive = accessState === "active";
  const isExpired = accessState === "expired";
  const pendingDate = me.paymentIntent?.createdAt
    ? new Intl.DateTimeFormat(language === "es" ? "es-ES" : language === "pt" ? "pt-PT" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(me.paymentIntent.createdAt))
    : null;

  async function requestPayment() {
    if (!features.paymentIntents) return;
    if (alreadyOpen) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<PaymentIntentDTO>("/api/payments/intent", {
        method: "POST",
        body: {
          selectedPlanId: selectedPlan?.id ?? null,
        },
      });
      getWebApp()?.HapticFeedback?.notificationOccurred("success");
      setJustRequested(true);
      onRequested();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle>{t.renew.title}</CardTitle>
        <p className="text-sm leading-relaxed text-tg-hint">
          {isActive
            ? `Puedes ampliar tu acceso antes de que caduque. El periodo actual no se pierde; ${brand.creatorName} lo extiende cuando confirma el pago.`
            : isExpired
              ? `Renueva para recuperar tu acceso. ${brand.creatorName} coordina el pago y revisa la renovación manualmente.`
              : `Elige cuánto tiempo quieres entrar al VIP privado. ${brand.creatorName} coordina el pago y confirma el acceso por privado.`}
        </p>
      </Card>

      <Card>
        <CardTitle>{t.renew.stepsTitle}</CardTitle>
        <ol className="space-y-2 pt-1">
          {t.renew.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-relaxed">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tg-secondaryBg text-xs font-bold text-tg-button">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardTitle>Elige periodo</CardTitle>
        <div className="space-y-2">
          {plans.all.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanId(plan.id)}
              className={cn(
                "w-full rounded-card p-3 text-left ring-1 transition",
                plan.highlighted ? "bg-tg-secondaryBg ring-tg-button/30" : "bg-tg-bg ring-black/10",
                selectedPlanId === plan.id && "ring-2 ring-tg-button",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{plan.name}</p>
                    {plan.badge && (
                      <span className="rounded-full bg-tg-button px-2 py-0.5 text-xs font-semibold text-tg-buttonText">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-tg-hint">{plan.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">{plan.displayPrice}</p>
                  <p className="text-xs text-tg-hint">{plan.durationLabel}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-tg-button" />
        <div>
          <CardTitle>{t.renew.manualFlowTitle}</CardTitle>
          <p className="text-sm leading-relaxed text-tg-hint">{t.renew.manualFlowCopy}</p>
        </div>
      </Card>

      {selectedPlan && (
        <Card>
          <CardTitle>Resumen del plan</CardTitle>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{selectedPlan.name}</p>
              <p className="mt-1 text-sm text-tg-hint">
                {selectedPlan.durationLabel} · {selectedPlan.renewalText.toLowerCase()}
              </p>
            </div>
            <p className="shrink-0 text-lg font-bold">{selectedPlan.displayPrice}</p>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Fidelidad</CardTitle>
        <p className="text-sm leading-relaxed text-tg-hint">
          Cualquier ajuste de fidelidad se coordina manualmente con {brand.creatorName}/admin y debe coincidir con los planes vigentes del dashboard.
        </p>
      </Card>

      <Card>
        <CardTitle>{t.renew.instructionsTitle}</CardTitle>
        {instructions ? (
          <p className="whitespace-pre-wrap text-base leading-relaxed">{instructions}</p>
        ) : (
          <p className="text-sm text-tg-hint">{t.renew.noInstructions}</p>
        )}
      </Card>

      {adminContact ? (
        <ContactButton
          contact={adminContact}
          me={me}
          selectedPlanId={selectedPlanId}
        />
      ) : (
        <Card>
          <CardTitle>Contacto</CardTitle>
          <p className="text-sm text-tg-hint">Contacto no configurado</p>
        </Card>
      )}

      {features.paymentIntents && (
        <div className="pt-1">
          {alreadyOpen ? (
          <Card className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
            <div>
              <p className="font-semibold">
                {justRequested ? t.renew.requested : t.renew.alreadyRequested}
              </p>
              <p className="text-sm text-tg-hint">
                {pendingDate ? `${t.status.pendingSince}: ${pendingDate}` : t.renew.requestedHint}
              </p>
            </div>
          </Card>
          ) : (
          <Card className="space-y-3">
            <div>
              <CardTitle>Aviso de pago</CardTitle>
              <p className="text-sm leading-relaxed text-tg-hint">
                Pulsa solo cuando ya hayas pagado fuera de la MiniApp. Esto no activa nada automáticamente: deja un aviso para revisión manual.
              </p>
            </div>
            <Button onClick={requestPayment} loading={submitting} disabled={!selectedPlan}>
              <CreditCard className="h-5 w-5" />
              {submitting ? t.renew.requesting : t.renew.requestButton}
            </Button>
          </Card>
          )}
          {error && <p className="mt-2 text-center text-sm text-tg-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ContactButton({
  contact,
  me,
  selectedPlanId,
}: {
  contact: string;
  me: MeDTO;
  selectedPlanId: string | null;
}) {
  const { t, isDevMock, user: telegramUser } = useTelegram();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function open() {
    setError(null);
    setPreview(null);
    const result = openPreparedContact({
      contact,
      isDevMock,
      invalidLabel: t.renew.contactInvalid,
      previewLabel: t.renew.contactPreview,
      message: buildAccessMessage({
        me,
        telegramUser,
        selectedPlanId,
        creatorName: appConfig.brand.creatorName,
      }),
    });
    setError(result.error);
    setPreview(result.preview);
  }

  return (
    <div className="space-y-2">
      <Button onClick={open}>
        <MessageCircle className="h-5 w-5" />
        {`Hablar con ${appConfig.brand.creatorName} para entrar o renovar`}
      </Button>
      {error && <p className="text-center text-sm text-tg-destructive">{error}</p>}
      {preview && <p className="whitespace-pre-wrap text-center text-sm text-tg-hint">{preview}</p>}
    </div>
  );
}
