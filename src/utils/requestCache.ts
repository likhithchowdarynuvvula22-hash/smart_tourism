import crypto from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Request-scoped and short-lived in-memory cache utility.
 *
 * Prevents redundant database queries and external HTTP fetches within
 * single requests and across short-lived identical operations.
 *
 * ZERO global caching of private user profiles, authenticated budgets, or trips.
 */
export class RequestCache {
  private readonly store: Map<string, CacheEntry<unknown>> = new Map();
  private readonly inFlight: Map<string, Promise<unknown>> = new Map();

  /**
   * Retrieves a cached value if present and not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Sets a value in the cache with a specified TTL (defaults to 30s).
   */
  set<T>(key: string, value: T, ttlMs: number = 30000): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Gets a cached value, or executes the fetcher, stores the result, and returns it.
   * Concurrent calls for the same key await the same in-flight Promise to avoid duplicate work.
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = 30000): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        this.set(key, result, ttlMs);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Deletes a specific key.
   */
  delete(key: string): void {
    this.store.delete(key);
    this.inFlight.delete(key);
  }

  /**
   * Clears all cached items.
   */
  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  /**
   * Helper key builders ensuring all influencing parameters are encapsulated.
   */
  static keys = {
    destination: (id: string) => `destination:${id}`,
    destinationBundle: (id: string, include: string[] = []) =>
      `bundle:${id}:${[...include].sort().join(",")}`,
    weather: (lat: number, lon: number, date?: string) =>
      `weather:${lat.toFixed(3)},${lon.toFixed(3)}:${date || "live"}`,
    route: (
      originLat: number,
      originLon: number,
      destLat: number,
      destLon: number,
      profile: string = "driving"
    ) =>
      `route:${originLat.toFixed(3)},${originLon.toFixed(3)}:${destLat.toFixed(3)},${destLon.toFixed(3)}:${profile}`,
    translation: (source: string, target: string, text: string) => {
      const hash = crypto.createHash("md5").update(text).digest("hex").slice(0, 10);
      return `translation:${source}:${target}:${hash}`;
    },
    tool: (toolName: string, destinationId?: string, date?: string) =>
      `tool:${toolName}:${destinationId || "global"}:${date || "live"}`
  };
}

export const requestCache = new RequestCache();
