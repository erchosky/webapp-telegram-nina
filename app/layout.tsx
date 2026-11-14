import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { appConfig } from "@/lib/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.brand.appTitle,
  description: `${appConfig.brand.productName} de ${appConfig.brand.creatorName}: acceso, privado, contacto e invitación.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const shouldLoadTelegramSdk =
  process.env.E2E_TEST_MODE !== "1" &&
  (process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_ALLOW_REAL_TELEGRAM_LOCAL === "1");

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {shouldLoadTelegramSdk && (
          <Script
            src="https://telegram.org/js/telegram-web-app.js"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
