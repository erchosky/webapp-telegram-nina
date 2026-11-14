import type { ApiResponse } from "@/lib/api/dto";
import { getInitData } from "@/lib/telegram/webapp";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Call a Mini App API route, attaching the signed Telegram initData as a bearer
 * (`Authorization: tma <initData>`). Throws ApiError on a non-ok response.
 */
export async function apiFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; signal?: AbortSignal; body?: unknown } = {},
): Promise<T> {
  if (process.env.NODE_ENV === "development") {
    const { isDevMockActive } = await import("@/lib/dev/mockTelegram");
    if (isDevMockActive()) {
      const { mockApiFetch } = await import("@/lib/dev/mockApi");
      return mockApiFetch<T>(path, init);
    }
  }

  const initData = getInitData();
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      signal: init.signal,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        Authorization: `tma ${initData}`,
        "content-type": "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network_error", friendlyApiMessage(0, "network_error"));
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, "bad_response", friendlyApiMessage(res.status, "bad_response"));
  }

  if (!body || body.ok !== true) {
    const err = body && body.ok === false ? body.error : null;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      friendlyApiMessage(res.status, err?.code, err?.message),
    );
  }

  return body.data;
}

function friendlyApiMessage(status: number, code?: string, serverMessage?: string): string {
  if (status === 0) return "No hay conexión. Revisa la red y vuelve a intentarlo.";
  if (status === 401) return "No se pudo verificar tu sesión de Telegram. Cierra y abre la MiniApp.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 429) return "Demasiados intentos. Espera un poco y vuelve a probar.";
  if (status >= 500) return "El servicio no está disponible ahora. Inténtalo más tarde.";
  if (code === "bad_response") return "La respuesta del servicio no se pudo leer.";
  return serverMessage || "No se pudo completar la acción. Inténtalo de nuevo.";
}
