import "server-only";
import { NextResponse } from "next/server";
import { authenticate, AuthError, type AuthContext } from "@/lib/telegram/auth";

export const GENERIC_CLIENT_ERROR =
  "No se pudo completar la acción. Inténtalo de nuevo.";

export interface RouteOptions {
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
}

/**
 * Wrap an authenticated route handler. Validates Telegram initData, resolves the
 * user, runs the handler, and converts known errors into clean JSON responses.
 * Responses are always non-cacheable (per-user, real data).
 */
export function withAuth(
  handler: (ctx: AuthContext, req: Request) => Promise<unknown>,
  options: RouteOptions = {},
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    try {
      const ctx = await authenticate(req);
      if (options.rateLimit) {
        const { checkRateLimit } = await import("@/lib/api/rateLimit");
        await checkRateLimit(req, ctx, options.rateLimit);
      }
      const data = await handler(ctx, req);
      return jsonOk(data);
    } catch (err) {
      if (err instanceof AuthError) {
        logServerError("auth", err);
        return jsonError(err.status, err.code, clientMessage(err));
      }
      if (err instanceof ServiceError) {
        logServerError("service", err);
        return jsonError(err.status, err.code, clientMessage(err));
      }
      console.error("[miniapp] unhandled route error:", err);
      return jsonError(500, "internal_error", "Internal server error");
    }
  };
}

export function jsonOk(data: unknown): NextResponse {
  return NextResponse.json(
    { ok: true, data },
    { headers: { "cache-control": "no-store" } },
  );
}

export function jsonError(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message: message ?? code } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/** Domain-level error that maps to an HTTP status. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage?: string;
  readonly context?: Record<string, unknown>;
  constructor(
    status: number,
    code: string,
    message?: string,
    options: { publicMessage?: string; context?: Record<string, unknown> } = {},
  ) {
    super(message ?? code);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
    this.publicMessage = options.publicMessage;
    this.context = options.context;
  }
}

function clientMessage(err: AuthError | ServiceError): string {
  if (err instanceof ServiceError && err.publicMessage) return err.publicMessage;
  if (err.code === "db_error") return GENERIC_CLIENT_ERROR;
  if (err.status >= 500) return GENERIC_CLIENT_ERROR;
  return err.message;
}

function logServerError(scope: string, err: AuthError | ServiceError): void {
  if (err.status < 500 && err.code !== "db_error") return;
  console.error("[miniapp] route error", {
    scope,
    code: err.code,
    status: err.status,
    message: err.message,
    context: err instanceof ServiceError ? err.context : undefined,
  });
}
