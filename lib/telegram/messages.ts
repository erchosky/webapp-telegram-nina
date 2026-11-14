export type TelegramLanguage = "es" | "en";

export type TelegramMessageContext = {
  nombre?: string | null;
  fechaCaducidad?: string | Date | null;
  enlace?: string | null;
  nombreGrupo?: string | null;
  diasRestantes?: number | null;
  horasRestantes?: number | null;
  contactoAdmin?: string | null;
  instruccionesPago?: string | null;
  bienvenida?: string | null;
  renovacion?: string | null;
  soporte?: string | null;
};

export type TelegramMessages = {
  startPending: (ctx?: TelegramMessageContext) => string;
  startActive: (ctx: TelegramMessageContext) => string;
  startExpired: (ctx?: TelegramMessageContext) => string;
  startCancelled: (ctx?: TelegramMessageContext) => string;
  statusActive: (ctx: TelegramMessageContext) => string;
  statusPending: (ctx?: TelegramMessageContext) => string;
  statusExpired: (ctx?: TelegramMessageContext) => string;
  statusCancelled: (ctx?: TelegramMessageContext) => string;
  paymentValidated: string;
  inviteSent: (inviteLink: string, ctx?: TelegramMessageContext) => string;
  inviteReused: (inviteLink: string) => string;
  inviteNotDelivered: (ctx?: TelegramMessageContext) => string;
  botBlocked: (ctx?: TelegramMessageContext) => string;
  warning72h: (ctx?: TelegramMessageContext) => string;
  warning48h: (ctx?: TelegramMessageContext) => string;
  warning24h: (ctx?: TelegramMessageContext) => string;
  warning1h: string;
  accessExpired: (ctx?: TelegramMessageContext) => string;
  renewalConfirmed: (ctx: TelegramMessageContext) => string;
  genericError: string;
  startMenuIntro: string;
  menuSubscription: string;
  menuHelp: string;
  menuAccess: string;
  menuProfile: string;
  accessActive: string;
  accessPending: (ctx?: TelegramMessageContext) => string;
  accessNoSubscription: (ctx?: TelegramMessageContext) => string;
  accessNeedsReview: string;
  accessInviteUnavailable: (ctx?: TelegramMessageContext) => string;
  unknownPrivate: string;
  unknownGroup: string;
  statusPrivateOnly: string;
  idPrivate: (telegramUserId: number, chatId: number) => string;
  idGroup: (telegramUserId: number, chatId: number, chatType: string, chatTitle?: string) => string;
  help: (ctx?: TelegramMessageContext) => string;
  referralLink: (link: string) => string;
  existingGroupMigration: (botUsername?: string | null) => string;
  renewalButton: string;
  renewalFallback: (ctx?: TelegramMessageContext) => string;
  profileTitle: string;
  profileLabels: {
    status: string;
    startsAt: string;
    expiresAt: string;
    daysLeft: string;
    totalSubscribed: string;
    renewals: string;
    currentStreak: string;
    group: string;
    support: string;
    empty: string;
    monthsDays: (months: number, days: number) => string;
    days: (days: number) => string;
    monthCount: (months: number) => string;
  };
  statusLabels: {
    active: string;
    pending_validation: string;
    needs_manual_review: string;
    expired: string;
    cancelled: string;
  };
};

function date(value: string | Date, language: TelegramLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(new Date(value));
}

function optionalExpiry(value: string | Date | null | undefined, language: TelegramLanguage) {
  return value ? date(value, language) : language === "en" ? "without a configured end date" : "sin fecha de caducidad configurada";
}

function line(value?: string | null) {
  return value?.trim() || null;
}

function contact(ctx?: TelegramMessageContext) {
  return line(ctx?.contactoAdmin) ?? "Nina";
}

function paymentHelp(ctx: TelegramMessageContext | undefined, language: TelegramLanguage) {
  return line(ctx?.instruccionesPago)
    ?? (language === "en" ? `If you have not paid yet, contact ${contact(ctx)}.` : `Si todavía no has hecho el pago, escribe a ${contact(ctx)} para validar tu acceso.`);
}

function supportHelp(ctx: TelegramMessageContext | undefined, language: TelegramLanguage) {
  return line(ctx?.soporte)
    ?? (language === "en" ? `Contact ${contact(ctx)} if you need help.` : `Si tienes cualquier problema, escribe a ${contact(ctx)}.`);
}

function renewalHelp(ctx: TelegramMessageContext | undefined, language: TelegramLanguage) {
  return line(ctx?.renovacion)
    ?? (language === "en" ? `To renew, contact ${contact(ctx)}.` : `Para renovar y seguir dentro de mi archivo VIP, escribe a ${contact(ctx)}.`);
}

function buildMessages(language: TelegramLanguage): TelegramMessages {
  const isEn = language === "en";
  const messages: TelegramMessages = {
    startPending: (ctx) => [
      line(ctx?.bienvenida) ?? (isEn ? "You have been registered successfully." : "Ya estás registrado en mi sistema VIP."),
      isEn ? "Your access is pending validation." : "Tu acceso queda pendiente de validación.",
      isEn ? "When payment is confirmed, you will receive your access link here." : "Cuando valide tu pago, recibirás aquí tu enlace privado.",
      paymentHelp(ctx, language)
    ].filter(Boolean).join("\n"),
    startActive: (ctx) =>
      isEn
        ? `Your VIP access${ctx.nombreGrupo ? ` to ${ctx.nombreGrupo}` : ""} is active until ${optionalExpiry(ctx.fechaCaducidad, language)}.`
        : `Tu acceso VIP${ctx.nombreGrupo ? ` a ${ctx.nombreGrupo}` : ""} está activo hasta ${optionalExpiry(ctx.fechaCaducidad, language)}. Disfrútalo bajo mis reglas.`,
    startExpired: (ctx) =>
      isEn ? `Your VIP access has expired. ${renewalHelp(ctx, language)}` : `Tu acceso VIP ha caducado. ${renewalHelp(ctx, language)}`,
    startCancelled: (ctx) =>
      isEn ? `Your VIP access is cancelled. ${supportHelp(ctx, language)}` : `Tu acceso VIP está cancelado. ${supportHelp(ctx, language)}`,
    statusActive: (ctx) =>
      isEn ? `Status: active\nExpires: ${optionalExpiry(ctx.fechaCaducidad, language)}.` : `Estado: activo\nCaduca: ${optionalExpiry(ctx.fechaCaducidad, language)}.`,
    statusPending: (ctx) =>
      isEn ? `Status: pending validation.\n${paymentHelp(ctx, language)}` : `Estado: pendiente de validación.\n${paymentHelp(ctx, language)}`,
    statusExpired: (ctx) =>
      isEn ? `Status: expired.\n${renewalHelp(ctx, language)}` : `Estado: caducado.\n${renewalHelp(ctx, language)}`,
    statusCancelled: (ctx) =>
      isEn ? `Status: cancelled.\n${supportHelp(ctx, language)}` : `Estado: cancelado.\n${supportHelp(ctx, language)}`,
    paymentValidated: isEn ? "Payment validated. Your VIP access is ready." : "Pago validado. Tu acceso VIP ya está listo.",
    inviteSent: (inviteLink, ctx) =>
      isEn
        ? `${messages.paymentValidated} This personal link expires in 24 hours:\n${inviteLink}${ctx?.nombreGrupo ? `\nGroup: ${ctx.nombreGrupo}` : ""}`
        : `${messages.paymentValidated} Este enlace es personal y caduca en 24 horas:\n${inviteLink}${ctx?.nombreGrupo ? `\nGrupo: ${ctx.nombreGrupo}` : ""}`,
    inviteReused: (inviteLink) =>
      isEn ? `You already had an active link. Here it is again:\n${inviteLink}` : `Ya tenías un enlace activo. Te lo envío de nuevo:\n${inviteLink}`,
    inviteNotDelivered: (ctx) =>
      isEn ? `I could not deliver your link via Telegram. ${supportHelp(ctx, language)}` : `No he podido enviarte el enlace por Telegram. ${supportHelp(ctx, language)}`,
    botBlocked: (ctx) =>
      isEn ? `It looks like the bot cannot send you private messages. Open this chat and contact ${contact(ctx)} if it still fails.` : `Parece que el bot no puede escribirte por privado. Abre este chat y, si sigue fallando, escribe a ${contact(ctx)}.`,
    warning72h: (ctx) =>
      isEn ? `Your VIP access expires in 3 days. ${renewalHelp(ctx, language)}` : `Tu acceso VIP caduca en 3 días. Si quieres seguir dentro, renueva a tiempo. ${renewalHelp(ctx, language)}`,
    warning48h: (ctx) =>
      isEn
        ? `Hi, you have 2 days of VIP access left. If you want to keep enjoying the group, contact the creator to renew. ${line(ctx?.renovacion) ?? ""}`.trim()
        : `Te quedan 2 días de acceso VIP. Si quieres seguir dentro de mi archivo privado, renueva antes de que caduque. ${line(ctx?.renovacion) ?? ""}`.trim(),
    warning24h: (ctx) =>
      isEn ? `Your VIP access expires tomorrow. ${renewalHelp(ctx, language)}` : `Tu acceso VIP caduca mañana. Si quieres seguir dentro, es momento de renovar. ${renewalHelp(ctx, language)}`,
    warning1h: isEn ? "Your VIP access expires in 1 hour." : "Tu acceso VIP caduca en 1 hora.",
    accessExpired: (ctx) =>
      isEn ? `Your VIP subscription has ended. ${renewalHelp(ctx, language)}` : `Tu acceso VIP ha terminado. ${renewalHelp(ctx, language)}`,
    renewalConfirmed: (ctx) =>
      isEn ? `Renewal confirmed. Your access expires on ${date(ctx.fechaCaducidad!, language)}.` : `Renovación confirmada. Sigues dentro hasta el ${date(ctx.fechaCaducidad!, language)}.`,
    genericError: isEn ? "Something went wrong. Try again later or contact support." : "Ha ocurrido un error. Inténtalo de nuevo más tarde o escribe a Nina.",
    startMenuIntro: isEn ? "Choose an option to check your VIP access:" : "Elige una opción para consultar tu acceso VIP:",
    menuSubscription: isEn ? "💳 My subscription" : "💳 Mi suscripción",
    menuHelp: isEn ? "❓ Help" : "❓ Ayuda",
    menuAccess: isEn ? "💼 VIP access" : "👑 Acceso VIP",
    menuProfile: isEn ? "👤 My profile" : "👤 Mi perfil",
    accessActive: isEn ? "Your access is active. Here is your personal access link:" : "Tu acceso está activo. Te envío tu enlace personal:",
    accessPending: (ctx) =>
      isEn ? `Your access is pending validation.\n${paymentHelp(ctx, language)}` : `Tu acceso está pendiente de validación.\n${paymentHelp(ctx, language)}`,
    accessNoSubscription: (ctx) =>
      isEn ? `You do not have an active subscription yet.\n${paymentHelp(ctx, language)}` : `Todavía no tienes una suscripción activa.\n${paymentHelp(ctx, language)}`,
    accessNeedsReview: isEn ? "Your case needs manual review before sending access. Contact support." : "Tu caso necesita revisión manual antes de enviar acceso. Escribe a Nina.",
    accessInviteUnavailable: (ctx) =>
      isEn ? `I cannot generate the link right now. ${supportHelp(ctx, language)}` : `No he podido generar el enlace ahora. ${supportHelp(ctx, language)}`,
    unknownPrivate: isEn ? "I did not understand that message. Use /start to register or /estado to check your access." : "No he entendido ese mensaje. Usa /start para registrarte o /estado para consultar tu acceso.",
    unknownGroup: isEn ? "Use the private chat with me to check your access." : "Escríbeme por privado para consultar tu acceso.",
    statusPrivateOnly: isEn ? "For privacy, use /estado in the private chat with me." : "Por privacidad, consulta tu estado por privado con el bot.",
    idPrivate: (telegramUserId, chatId) => [
      isEn ? `Your Telegram ID is: ${telegramUserId}` : `Tu Telegram ID es: ${telegramUserId}`,
      isEn ? `Current chat ID: ${chatId}` : `Chat ID actual: ${chatId}`,
      isEn ? "Chat type: private" : "Tipo de chat: private"
    ].join("\n"),
    idGroup: (telegramUserId, chatId, chatType, chatTitle) => [
      isEn ? `Your Telegram ID is: ${telegramUserId}` : `Tu Telegram ID es: ${telegramUserId}`,
      isEn ? `Group chat ID: ${chatId}` : `Chat ID del grupo: ${chatId}`,
      isEn ? `Chat type: ${chatType}` : `Tipo de chat: ${chatType}`,
      ...(chatTitle ? [isEn ? `Group name: ${chatTitle}` : `Nombre del grupo: ${chatTitle}`] : [])
    ].join("\n"),
    help: (ctx) => [
      isEn ? "1. Start the bot with /start." : "1. Inicia el bot con /start.",
      isEn ? "2. The admin will activate your access." : "2. Nina validará tu acceso.",
      isEn ? "3. If you are active, you will receive a private group link." : "3. Si tu acceso está activo, recibirás un enlace privado al VIP.",
      isEn ? "4. We will notify you before it expires." : "4. Te avisaré antes de que caduque.",
      line(ctx?.soporte) ?? null
    ].filter(Boolean).join("\n"),
    referralLink: (link) =>
      isEn ? `Your referral link:\n${link}\n\nIf someone joins with your link and their payment is validated, you will receive +5 free days.` : `Tu enlace de referido:\n${link}\n\nSi alguien entra con tu enlace y su pago se valida, recibirás +5 días gratis.`,
    existingGroupMigration: (botUsername) => {
      const bot = botUsername ? `@${botUsername.replace(/^@/, "")}` : "the VIP bot";
      return isEn
        ? `To keep your VIP access, open ${bot} and press /start. This lets us link your access and avoid renewal issues.`
        : `Para mantener tu acceso VIP, abre ${bot} y pulsa /start. Así vinculo tu acceso y evito problemas con tu renovación.`;
    },
    renewalButton: isEn ? "💳 Renew subscription" : "💳 Renovar acceso",
    renewalFallback: (ctx) => renewalHelp(ctx, language),
    profileTitle: isEn ? "👤 Your VIP profile" : "👤 Tu perfil VIP",
    profileLabels: {
      status: isEn ? "Status" : "Estado",
      startsAt: isEn ? "Start" : "Alta",
      expiresAt: isEn ? "Expires" : "Caduca",
      daysLeft: isEn ? "Days left" : "Días restantes",
      totalSubscribed: isEn ? "Total subscribed" : "Tiempo total suscrito",
      renewals: isEn ? "Renewals" : "Renovaciones",
      currentStreak: isEn ? "Current streak" : "Racha actual",
      group: isEn ? "Group" : "Grupo",
      support: isEn ? "Support" : "Contacto",
      empty: "—",
      monthsDays: (months, days) => isEn ? `${months} months / ${days} days` : `${months} meses / ${days} días`,
      days: (days) => isEn ? `${days} days` : `${days} días`,
      monthCount: (months) => isEn ? `${months} month(s)` : `${months} mes(es)`
    },
    statusLabels: {
      active: isEn ? "Active" : "Activo",
      pending_validation: isEn ? "Pending" : "Pendiente",
      needs_manual_review: isEn ? "Needs manual review" : "Requiere revisión manual",
      expired: isEn ? "Expired" : "Caducado",
      cancelled: isEn ? "Cancelled" : "Cancelado"
    }
  };
  return messages;
}

const baseByLanguage: Record<TelegramLanguage, TelegramMessages> = {
  es: buildMessages("es"),
  en: buildMessages("en")
};

export function telegramLanguage(languageCode?: string | null): TelegramLanguage {
  const value = (languageCode ?? "").toLowerCase();
  if (value.startsWith("en")) return "en";
  return "es";
}

export function messagesFor(languageCode?: string | null) {
  return baseByLanguage[telegramLanguage(languageCode)];
}

export const telegramMessages = baseByLanguage.es;
export type TelegramMessageKey = keyof TelegramMessages;

export function renewalUrl(ctx?: TelegramMessageContext) {
  const raw = line(ctx?.contactoAdmin);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = raw.match(/^@?([A-Za-z0-9_]{5,32})$/)?.[1];
  return username ? `https://t.me/${username}` : null;
}
