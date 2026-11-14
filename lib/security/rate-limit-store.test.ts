import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore } from "./rate-limit-store";

describe("MemoryRateLimitStore", () => {
  it("limita por ventana y devuelve retryAfter", () => {
    const store = new MemoryRateLimitStore();

    expect(store.hit("user:1", 2, 10_000, 1_000)).toEqual({ allowed: true, retryAfter: 0 });
    expect(store.hit("user:1", 2, 10_000, 2_000)).toEqual({ allowed: true, retryAfter: 9 });
    expect(store.hit("user:1", 2, 10_000, 3_000)).toEqual({ allowed: false, retryAfter: 8 });
    expect(store.hit("user:1", 2, 10_000, 11_001)).toEqual({ allowed: true, retryAfter: 0 });
  });

  it("limpia entradas caducadas de forma incremental", () => {
    const store = new MemoryRateLimitStore({ cleanupPerHit: 2, maxEntries: 100 });

    store.hit("a", 1, 1_000, 0);
    store.hit("b", 1, 1_000, 0);
    store.hit("c", 1, 1_000, 0);
    expect(store.size()).toBe(3);

    store.hit("d", 1, 1_000, 2_000);

    expect(store.size()).toBeLessThan(4);
  });

  it("aplica límite máximo para evitar crecimiento no acotado", () => {
    const store = new MemoryRateLimitStore({ cleanupPerHit: 0, maxEntries: 3 });

    store.hit("a", 10, 60_000, 0);
    store.hit("b", 10, 60_000, 0);
    store.hit("c", 10, 60_000, 0);
    store.hit("d", 10, 60_000, 0);
    store.hit("e", 10, 60_000, 0);

    expect(store.size()).toBeLessThanOrEqual(3);
  });
});
