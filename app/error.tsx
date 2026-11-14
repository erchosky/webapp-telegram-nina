"use client";

import { Button } from "@/components/ui/Button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">No se pudo cargar esta pantalla</h1>
        <p className="text-sm leading-relaxed text-tg-hint">
          Inténtalo otra vez. Si sigue pasando, escríbeme por Telegram.
        </p>
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </main>
  );
}
