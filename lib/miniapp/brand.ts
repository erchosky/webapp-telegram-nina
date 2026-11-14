const creatorName = process.env.NEXT_PUBLIC_CREATOR_NAME || "Nina";
const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Mi VIP";

export const miniappBrand = {
  creatorName,
  productName,
  appTitle: creatorName,
  assistantLabel: "Menú privado",
  adminContactLabel: `Hablar con ${creatorName}`,
  avatarInitials: creatorName.slice(0, 1).toUpperCase(),
  badge: "Privado",
  verifiedLabel: "Verificado",
  headline: creatorName,
  subheadline: `Tu ${productName.toLowerCase()} con ${creatorName}. Revisa tu acceso, mira lo disponible y escríbeme con todo ya preparado, sin vueltas.`,
  primaryCta: "Solicitar acceso",
  secondaryCta: `Hablar con ${creatorName}`,
  benefits: [
    "Acceso, renovaciones y enlace en un mismo sitio",
    `Todo se revisa manualmente por ${creatorName}, sin automatismos raros`,
    "Mensajes preparados para ir al grano y no perder tiempo",
  ],
} as const;
