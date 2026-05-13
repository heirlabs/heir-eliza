/**
 * Request Cache for API Client.
 * Implements request deduplication and caching to reduce redundant API calls.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
}

export interface RequestCacheOptions {
  /** Default TTL in milliseconds */
  defaultTtl?: number;
  /** Maximum cache entries */
  maxEntries?: number;
  /** Custom key generator */
  keyGenerator?: (url: string, options?: RequestInit) => string;
}

/**
 * LRU-based request cache with TTL support.
 */
export class RequestCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private pending = new Map<string, Promise<unknown>>();
  private readonly defaultTtl: number;
  private readonly maxEntries: number;
  private readonly keyGenerator: (url: string, options?: RequestInit) => string;

  constructor(options: RequestCacheOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? 5000;
    this.maxEntries = options.maxEntries ?? 1000;
    this.keyGenerator = options.keyGenerator ?? this.defaultKeyGenerator;
  }

  private defaultKeyGenerator(url: string, options?: RequestInit): string {
    const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * Get cached data if valid.
   */
  get<T>(url: string, options?: RequestInit, ttl?: number): T | undefined {
    const key = this.keyGenerator(url, options);
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    const effectiveTtl = ttl ?? this.defaultTtl;
    if (Date.now() - entry.timestamp > effectiveTtl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Set cached data.
   */
  set<T>(url: string, data: T, options?: RequestInit, etag?: string): void {
    const key = this.keyGenerator(url, options);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      etag,
    });
  }

  /**
   * Get or fetch data with automatic caching and deduplication.
   */
  async getOrFetch<T>(
    url: string,
    fetcher: () => Promise<T>,
    options?: RequestInit,
    ttl?: number
  ): Promise<T> {
    const key = this.keyGenerator(url, options);

    // Check cache first
    const cached = this.get<T>(url, options, ttl);
    if (cached !== undefined) {
      return cached;
    }

    // Check if there's a pending request
    const pending = this.pending.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    // Create new request
    const promise = fetcher()
      .then((data) => {
        this.set(url, data, options);
        this.pending.delete(key);
        return data;
      })
      .catch((error) => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Invalidate cache for a specific URL pattern.
   */
  invalidate(urlPattern: string | RegExp): void {
    const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    maxEntries: number;
    pendingRequests: number;
  } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      pendingRequests: this.pending.size,
    };
  }

  /**
   * Get ETag for conditional requests.
   */
  getETag(url: string, options?: RequestInit): string | undefined {
    const key = this.keyGenerator(url, options);
    return this.cache.get(key)?.etag;
  }
}

/**
 * Decorator for caching API method results.
 */
export function cached(ttl?: number) {
  const cache = new RequestCache({ defaultTtl: ttl });

  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;

    descriptor.value = (async function (this: unknown, ...args: unknown[]) {
      const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;
      return cache.getOrFetch(cacheKey, () => originalMethod.apply(this, args));
    }) as T;

    return descriptor;
  };
}

/**
 * Create a cached fetch wrapper.
 */
export function createCachedFetch(options?: RequestCacheOptions): {
  fetch: typeof fetch;
  cache: RequestCache;
  invalidate: (pattern: string | RegExp) => void;
  clear: () => void;
} {
  const cache = new RequestCache(options);

  const cachedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    // Only cache GET requests by default
    if (method !== 'GET') {
      // Invalidate cache for mutations
      cache.invalidate(url);
      return fetch(input, init);
    }

    // Check for conditional request headers
    const etag = cache.getETag(url, init);
    const headers = new Headers(init?.headers);
    if (etag) {
      headers.set('If-None-Match', etag);
    }

    return cache.getOrFetch(
      url,
      async () => {
        const response = await fetch(input, { ...init, headers });

        // Handle 304 Not Modified
        if (response.status === 304) {
          const cached = cache.get<Response>(url, init);
          if (cached) return cached;
        }

        return response;
      },
      init
    );
  };

  return {
    fetch: cachedFetch as typeof fetch,
    cache,
    invalidate: (pattern) => cache.invalidate(pattern),
    clear: () => cache.clear(),
  };
}

/**
 * Request deduplication without caching.
 * Useful for preventing duplicate in-flight requests.
 */
export class RequestDeduplicator {
  private pending = new Map<string, Promise<unknown>>();

  /**
   * Execute a request with deduplication.
   * Concurrent calls with the same key will share the same promise.
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn()
      .then((result) => {
        this.pending.delete(key);
        return result;
      })
      .catch((error) => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Get the number of pending requests.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending requests.
   * Note: This doesn't cancel the requests, just removes tracking.
   */
  clear(): void {
    this.pending.clear();
  }
}

/**
 * Stale-while-revalidate cache strategy.
 * Returns stale data immediately while fetching fresh data in background.
 */
export class SWRCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private revalidating = new Set<string>();

  constructor(
    private readonly fetcher: (key: string) => Promise<T>,
    private readonly options: {
      staleTime?: number; // Time until data is considered stale
      cacheTime?: number; // Time until data is removed from cache
    } = {}
  ) {}

  private get staleTime(): number {
    return this.options.staleTime ?? 5000;
  }

  private get cacheTime(): number {
    return this.options.cacheTime ?? 60000;
  }

  /**
   * Get data with SWR strategy.
   */
  async get(key: string): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    // Remove expired entries
    if (cached && now - cached.timestamp > this.cacheTime) {
      this.cache.delete(key);
    }

    // If we have cached data
    if (cached) {
      // If stale, revalidate in background
      if (now - cached.timestamp > this.staleTime) {
        this.revalidate(key);
      }
      return cached.data;
    }

    // No cached data, fetch synchronously
    const data = await this.fetcher(key);
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  private async revalidate(key: string): Promise<void> {
    if (this.revalidating.has(key)) return;

    this.revalidating.add(key);
    try {
      const data = await this.fetcher(key);
      this.cache.set(key, { data, timestamp: Date.now() });
    } finally {
      this.revalidating.delete(key);
    }
  }

  /**
   * Invalidate a cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.revalidating.clear();
  }
}
