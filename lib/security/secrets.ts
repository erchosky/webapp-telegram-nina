import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function safeEqual(received: unknown, expected: string) {
  if (typeof received !== "string") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

export function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Error interno";
  return error.name === "Error" ? "Error interno" : error.name;
}
