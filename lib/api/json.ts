import "server-only";

import { ServiceError } from "@/lib/api/respond";

export type BoundedJsonOptions = {
  maxBytes: number;
};

/**
 * Read a JSON request without trusting proxy metadata alone.
 *
 * The declared Content-Length is rejected early when possible, while the body
 * stream is still counted so a missing or forged header cannot bypass the
 * limit. Compressed request bodies are deliberately unsupported: the public
 * API does not need them and accepting them would complicate size guarantees.
 */
export async function readBoundedJson(
  request: Request,
  { maxBytes }: BoundedJsonOptions,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  assertJsonContentType(request.headers.get("content-type"));
  assertIdentityEncoding(request.headers.get("content-encoding"));
  assertDeclaredLength(request.headers.get("content-length"), maxBytes);

  const bytes = await readBodyBytes(request, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidJson();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJson();
  }
}

function assertJsonContentType(contentType: string | null): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ServiceError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json",
      { publicMessage: "La solicitud debe enviarse como JSON." },
    );
  }
}

function assertIdentityEncoding(contentEncoding: string | null): void {
  const encoding = contentEncoding?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    throw new ServiceError(
      415,
      "unsupported_content_encoding",
      "Compressed request bodies are not supported",
      { publicMessage: "El cuerpo comprimido no está permitido." },
    );
  }
}

function assertDeclaredLength(contentLength: string | null, maxBytes: number): void {
  if (contentLength === null) return;
  if (!/^\d+$/.test(contentLength)) {
    throw new ServiceError(400, "invalid_content_length", "Invalid Content-Length header", {
      publicMessage: "La longitud declarada del cuerpo no es válida.",
    });
  }
  if (BigInt(contentLength) > BigInt(maxBytes)) throw payloadTooLarge(maxBytes);
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("JSON payload exceeds configured limit");
        throw payloadTooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function payloadTooLarge(maxBytes: number): ServiceError {
  return new ServiceError(413, "payload_too_large", `JSON body exceeds ${maxBytes} bytes`, {
    publicMessage: "El cuerpo de la solicitud es demasiado grande.",
  });
}

function invalidJson(): ServiceError {
  return new ServiceError(400, "invalid_json", "Request body is not valid UTF-8 JSON", {
    publicMessage: "El cuerpo JSON no es válido.",
  });
}
