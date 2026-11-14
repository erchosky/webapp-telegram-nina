"use client";

import { Button } from "@/components/ui/Button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-tg-bg px-6 text-tg-text">
          <div className="max-w-sm space-y-4 text-center">
            <h1 className="text-2xl font-bold">Algo no cargó bien</h1>
            <p className="text-sm leading-relaxed text-tg-hint">
              Cierra y abre la MiniApp o intenta cargar de nuevo.
            </p>
            <Button onClick={reset}>Reintentar</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
