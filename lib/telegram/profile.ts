import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { userAccessStatus } from "../user-access";
import { messagesFor, telegramLanguage, type TelegramMessageContext, type TelegramMessages } from "./messages";

function daysLeft(endsAt?: string | null, now = new Date()) {
  if (!endsAt) return "—";
  const diff = new Date(endsAt).getTime() - now.getTime();
  return String(Math.max(0, Math.ceil(diff / 86_400_000)));
}

function totalSubscribed(subscriptions: Array<{ starts_at?: string | null; ends_at?: string | null }>, labels: TelegramMessages["profileLabels"]) {
  const days = subscriptions.reduce((total, sub) => {
    if (!sub.starts_at || !sub.ends_at) return total;
    return total + Math.max(0, Math.round((new Date(sub.ends_at).getTime() - new Date(sub.starts_at).getTime()) / 86_400_000));
  }, 0);
  const months = Math.floor(days / 30);
  return months > 0 ? labels.monthsDays(months, days) : labels.days(days);
}

export async function profileMessage(userId: string, languageCode?: string | null, context: TelegramMessageContext = {}) {
  const language = telegramLanguage(languageCode);
  const locale = language === "en" ? "en-US" : "es-ES";
  const fmtLocalized = (value?: string | null) =>
    value ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value)) : "—";
  const db = createAdminClient();
  const [{ data: subscriptions, error: subError }, { data: payments, error: payError }, { data: user, error: userError }] = await Promise.all([
    db.from("subscriptions").select("*").eq("telegram_user_id", userId).order("created_at", { ascending: false }),
    db.from("manual_payments").select("id").eq("telegram_user_id", userId),
    db.from("telegram_users").select("current_streak_months").eq("id", userId).maybeSingle()
  ]);
  if (subError) throw subError;
  if (payError) throw payError;
  if (userError) throw userError;

  const list = subscriptions ?? [];
  const current = selectCurrentSubscription(list);
  const status = userAccessStatus(current);
  const messages = messagesFor(language);
  const labels = messages.profileLabels;
  const statusLabel = messages.statusLabels[status];
  const renewals = Math.max(0, list.filter((item) => item.status === "active" || item.status === "expired").length - 1);
  const paymentCount = payments?.length ?? 0;
  const help = status === "active" ? null : messages.renewalFallback(context);

  return [
    messages.profileTitle,
    `${labels.status}: ${statusLabel}`,
    `${labels.startsAt}: ${fmtLocalized(current?.starts_at)}`,
    `${labels.expiresAt}: ${fmtLocalized(current?.ends_at)}`,
    `${labels.daysLeft}: ${daysLeft(current?.ends_at)}`,
    `${labels.totalSubscribed}: ${totalSubscribed(list, labels)}`,
    `${labels.renewals}: ${Math.max(renewals, paymentCount > 0 ? paymentCount - 1 : 0)}`,
    `${labels.currentStreak}: ${labels.monthCount(user?.current_streak_months ?? 0)}`,
    `${labels.group}: ${context.nombreGrupo ?? labels.empty}`,
    `${labels.support}: ${context.contactoAdmin ?? context.soporte ?? labels.empty}`,
    help ? "" : null,
    help
  ].filter((line) => line !== null).join("\n");
}
