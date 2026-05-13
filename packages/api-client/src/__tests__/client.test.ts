import { describe, it, expect, beforeEach } from 'bun:test';
import { RequestCache, RequestDeduplicator, SWRCache } from '../lib/requestCache';
import { BatchProcessor, BatchRequestAggregator } from '../lib/batchOperations';
import { CursorPaginator, InfiniteScrollLoader, createCursor, parseCursor } from '../lib/pagination';

describe('RequestCache', () => {
  let cache: RequestCache;

  beforeEach(() => {
    cache = new RequestCache({ defaultTtl: 100, maxEntries: 10 });
  });

  it('should cache GET requests', () => {
    cache.set('/api/users', [{ id: 1 }]);
    expect(cache.get('/api/users')).toEqual([{ id: 1 }]);
  });

  it('should expire cache based on TTL', async () => {
    cache.set('/api/data', { value: 42 });
    expect(cache.get('/api/data')).toEqual({ value: 42 });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cache.get('/api/data')).toBeUndefined();
  });

  it('should deduplicate concurrent requests', async () => {
    let fetchCount = 0;

    const fetcher = async () => {
      fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { data: 'test' };
    };

    const [r1, r2] = await Promise.all([
      cache.getOrFetch('/api/item', fetcher),
      cache.getOrFetch('/api/item', fetcher),
    ]);

    expect(r1).toEqual({ data: 'test' });
    expect(r2).toEqual({ data: 'test' });
    expect(fetchCount).toBe(1);
  });

  it('should invalidate by pattern', () => {
    cache.set('/api/users/1', { id: 1 });
    cache.set('/api/users/2', { id: 2 });
    cache.set('/api/posts/1', { id: 1 });

    cache.invalidate(/\/api\/users/);

    expect(cache.get('/api/users/1')).toBeUndefined();
    expect(cache.get('/api/users/2')).toBeUndefined();
    expect(cache.get('/api/posts/1')).toEqual({ id: 1 });
  });
});

describe('RequestDeduplicator', () => {
  it('should deduplicate concurrent requests', async () => {
    const deduplicator = new RequestDeduplicator();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'result';
    };

    const [r1, r2, r3] = await Promise.all([
      deduplicator.dedupe('key1', fn),
      deduplicator.dedupe('key1', fn),
      deduplicator.dedupe('key2', fn),
    ]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(callCount).toBe(2); // key1 deduped, key2 separate
  });
});

describe('SWRCache', () => {
  it('should return stale data while revalidating', async () => {
    let fetchCount = 0;
    const cache = new SWRCache(
      async (key: string) => {
        fetchCount++;
        return `data-${key}-${fetchCount}`;
      },
      { staleTime: 50, cacheTime: 200 }
    );

    const r1 = await cache.get('test');
    expect(r1).toBe('data-test-1');

    // Within stale time
    const r2 = await cache.get('test');
    expect(r2).toBe('data-test-1');
    expect(fetchCount).toBe(1);

    // After stale time, returns cached but revalidates
    await new Promise((resolve) => setTimeout(resolve, 60));
    const r3 = await cache.get('test');
    expect(r3).toBe('data-test-1'); // Still returns cached

    // Wait for revalidation
    await new Promise((resolve) => setTimeout(resolve, 20));
    const r4 = await cache.get('test');
    expect(r4).toBe('data-test-2'); // Now updated
  });
});

describe('BatchProcessor', () => {
  it('should batch operations', async () => {
    let batchCount = 0;

    const processor = new BatchProcessor<number, number>(
      async (inputs) => {
        batchCount++;
        return inputs.map((x) => x * 2);
      },
      { maxBatchSize: 3, maxDelay: 20 }
    );

    const results = await Promise.all([
      processor.add(1),
      processor.add(2),
      processor.add(3),
    ]);

    expect(results).toEqual([2, 4, 6]);
    expect(batchCount).toBe(1);
  });

  it('should flush on max batch size', async () => {
    let batchCount = 0;

    const processor = new BatchProcessor<number, number>(
      async (inputs) => {
        batchCount++;
        return inputs.map((x) => x * 2);
      },
      { maxBatchSize: 2, maxDelay: 1000 }
    );

    const results = await Promise.all([
      processor.add(1),
      processor.add(2),
      processor.add(3),
      processor.add(4),
    ]);

    expect(results).toEqual([2, 4, 6, 8]);
    expect(batchCount).toBe(2);
  });
});

describe('BatchRequestAggregator', () => {
  it('should aggregate requests', async () => {
    let fetchCount = 0;

    const aggregator = new BatchRequestAggregator<string, { id: string; name: string }>(
      async (ids) => {
        fetchCount++;
        const result = new Map<string, { id: string; name: string }>();
        for (const id of ids) {
          result.set(id, { id, name: `User ${id}` });
        }
        return result;
      },
      (id) => id,
      { maxBatchSize: 10, maxDelay: 20 }
    );

    const [u1, u2, u3] = await Promise.all([
      aggregator.get('1'),
      aggregator.get('2'),
      aggregator.get('1'), // Duplicate
    ]);

    expect(u1).toEqual({ id: '1', name: 'User 1' });
    expect(u2).toEqual({ id: '2', name: 'User 2' });
    expect(u3).toEqual({ id: '1', name: 'User 1' });
    expect(fetchCount).toBe(1);
  });
});

describe('CursorPaginator', () => {
  it('should paginate through results', async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const paginator = new CursorPaginator(
      async (params) => {
        const startIndex = params.cursor ? parseInt(params.cursor) : 0;
        const limit = params.limit ?? 3;
        const items = data.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        return {
          items,
          nextCursor: nextIndex < data.length ? String(nextIndex) : undefined,
          hasMore: nextIndex < data.length,
        };
      },
      { limit: 3 }
    );

    const page1 = await paginator.next();
    expect(page1).toEqual([1, 2, 3]);
    expect(paginator.hasMore).toBe(true);

    const page2 = await paginator.next();
    expect(page2).toEqual([4, 5, 6]);

    const page3 = await paginator.next();
    expect(page3).toEqual([7, 8, 9]);

    const page4 = await paginator.next();
    expect(page4).toEqual([10]);
    expect(paginator.hasMore).toBe(false);
  });

  it('should support async iteration', async () => {
    const data = [1, 2, 3, 4, 5];

    const paginator = new CursorPaginator(
      async (params) => {
        const startIndex = params.cursor ? parseInt(params.cursor) : 0;
        const limit = params.limit ?? 2;
        const items = data.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        return {
          items,
          nextCursor: nextIndex < data.length ? String(nextIndex) : undefined,
          hasMore: nextIndex < data.length,
        };
      },
      { limit: 2 }
    );

    const allItems: number[] = [];
    for await (const item of paginator) {
      allItems.push(item);
    }

    expect(allItems).toEqual([1, 2, 3, 4, 5]);
  });

  it('should support fetchN', async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const paginator = new CursorPaginator(
      async (params) => {
        const startIndex = params.cursor ? parseInt(params.cursor) : 0;
        const limit = params.limit ?? 3;
        const items = data.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        return {
          items,
          nextCursor: nextIndex < data.length ? String(nextIndex) : undefined,
          hasMore: nextIndex < data.length,
        };
      },
      { limit: 3 }
    );

    const first5 = await paginator.fetchN(5);
    expect(first5).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Cursor utilities', () => {
  it('should create and parse cursors', () => {
    const item = { id: 'abc123', name: 'Test', createdAt: new Date('2024-01-01') };
    const cursor = createCursor(item, 'id');

    const parsed = parseCursor(cursor);
    expect(parsed).not.toBeNull();
    expect(parsed?.value).toBe('abc123');
  });

  it('should handle invalid cursors', () => {
    expect(parseCursor('invalid')).toBeNull();
    expect(parseCursor('')).toBeNull();
  });
});

describe('InfiniteScrollLoader', () => {
  it('should load pages incrementally', async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const loader = new InfiniteScrollLoader(
      async (params) => {
        const startIndex = params.cursor ? parseInt(params.cursor) : 0;
        const limit = params.limit ?? 3;
        const items = data.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        return {
          items,
          nextCursor: nextIndex < data.length ? String(nextIndex) : undefined,
          hasMore: nextIndex < data.length,
        };
      },
      { limit: 3 }
    );

    await loader.loadMore();
    expect(loader.getState().items).toEqual([1, 2, 3]);
    expect(loader.getState().hasMore).toBe(true);

    await loader.loadMore();
    expect(loader.getState().items).toEqual([1, 2, 3, 4, 5, 6]);

    await loader.loadMore();
    await loader.loadMore();
    expect(loader.getState().items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(loader.getState().hasMore).toBe(false);
  });

  it('should support state subscription', async () => {
    const loader = new InfiniteScrollLoader(
      async () => ({
        items: [1, 2, 3],
        hasMore: false,
      }),
      { limit: 10 }
    );

    const states: Array<{ itemCount: number; isLoading: boolean }> = [];

    const unsubscribe = loader.subscribe((state) => {
      states.push({ itemCount: state.items.length, isLoading: state.isLoading });
    });

    await loader.loadMore();
    unsubscribe();

    expect(states.length).toBeGreaterThan(1);
    expect(states[states.length - 1].itemCount).toBe(3);
    expect(states[states.length - 1].isLoading).toBe(false);
  });
});

describe('Integration', () => {
  it('should work together for efficient data fetching', async () => {
    const cache = new RequestCache({ defaultTtl: 1000 });
    const deduplicator = new RequestDeduplicator();

    let fetchCount = 0;

    const fetchItem = async (id: string) => {
      return deduplicator.dedupe(`item-${id}`, async () => {
        return cache.getOrFetch(`/items/${id}`, async () => {
          fetchCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { id, name: `Item ${id}` };
        });
      });
    };

    // Concurrent requests for same items
    const [r1, r2, r3, r4] = await Promise.all([
      fetchItem('1'),
      fetchItem('1'),
      fetchItem('2'),
      fetchItem('2'),
    ]);

    expect(r1).toEqual({ id: '1', name: 'Item 1' });
    expect(r2).toEqual({ id: '1', name: 'Item 1' });
    expect(r3).toEqual({ id: '2', name: 'Item 2' });
    expect(r4).toEqual({ id: '2', name: 'Item 2' });
    expect(fetchCount).toBe(2); // Only 2 actual fetches
  });
});
