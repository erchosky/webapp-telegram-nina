"use client";

import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (data: T) => void;
}

/**
 * Load an async resource on mount with loading/error state and a reload action.
 * `loader` receives an AbortSignal so in-flight requests are cancelled on
 * unmount or reload.
 */
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  errorLabel: string,
  options: { enabled?: boolean } = {},
): Resource<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    loader(controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : errorLabel);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, errorLabel, loader, nonce]);

  return { data, loading, error, reload, setData };
}
