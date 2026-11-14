import "server-only";
export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number, now?: number): RateLimitResult;
  size(): number;
}

type Entry = { count: number; resetAt: number };

export class MemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, Entry>();
  private cleanupCursor = 0;

  constructor(
    private readonly options: {
      maxEntries?: number;
      cleanupPerHit?: number;
    } = {}
  ) {}

  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    this.cleanupIncremental(now);
    this.enforceMaxEntries();

    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      this.enforceMaxEntries();
      return { allowed: true, retryAfter: 0 };
    }

    current.count++;
    return { allowed: current.count <= limit, retryAfter: Math.ceil((current.resetAt - now) / 1_000) };
  }

  size() {
    return this.entries.size;
  }

  private cleanupIncremental(now: number) {
    const cleanupPerHit = this.options.cleanupPerHit ?? 25;
    if (this.entries.size === 0 || cleanupPerHit <= 0) return;

    const keys = Array.from(this.entries.keys());
    for (let i = 0; i < Math.min(cleanupPerHit, keys.length); i++) {
      if (this.cleanupCursor >= keys.length) this.cleanupCursor = 0;
      const key = keys[this.cleanupCursor++];
      const entry = this.entries.get(key);
      if (entry && entry.resetAt <= now) this.entries.delete(key);
    }
  }

  private enforceMaxEntries() {
    const maxEntries = this.options.maxEntries ?? 5_000;
    while (this.entries.size > maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}

export class SupabaseRateLimitStore implements RateLimitStore {
  hit(): RateLimitResult {
    throw new Error("SupabaseRateLimitStore todavía no está implementado. Usa Redis/Vercel KV/Upstash o una tabla dedicada antes de escalar a varias instancias.");
  }

  size() {
    return 0;
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  hit(): RateLimitResult {
    throw new Error("RedisRateLimitStore todavía no está implementado. Reemplaza MemoryRateLimitStore por una implementación distribuida en producción seria.");
  }

  size() {
    return 0;
  }
}
