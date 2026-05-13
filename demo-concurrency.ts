/**
 * ElizaOS Concurrency Demo
 * Demonstrates the new streamlined concurrent processing capabilities.
 */

import {
  Semaphore,
  rateLimited,
  LRUCache,
  UUIDCache,
  getSwizzledUUID,
  memoize,
  memoizeAsync,
  RequestScopedCache,
  MessageQueueService,
  createConcurrentRuntime,
  DEVELOPMENT_CONFIG,
} from './packages/core/src/index';

import {
  RequestCache,
  RequestDeduplicator,
  BatchProcessor,
  CursorPaginator,
  InfiniteScrollLoader,
} from './packages/api-client/src/index';

// Helper for logging with timestamps
function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  console.log(`[${timestamp}] ${message}`, data !== undefined ? data : '');
}

// Simulate async work
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function demoSemaphore() {
  console.log('\n=== SEMAPHORE DEMO ===');
  log('Testing concurrency limiting with semaphore (max 3 concurrent)');

  const semaphore = new Semaphore(3);
  let activeCount = 0;
  let maxActive = 0;

  const task = async (id: number) => {
    await semaphore.acquire();
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    log(`Task ${id} started (active: ${activeCount})`);
    await delay(100);
    log(`Task ${id} completed`);
    activeCount--;
    semaphore.release();
  };

  const start = Date.now();
  await Promise.all([1, 2, 3, 4, 5, 6].map(task));
  log(`All tasks completed in ${Date.now() - start}ms`);
  log(`Max concurrent tasks: ${maxActive}`);
}

async function demoRateLimited() {
  console.log('\n=== RATE LIMITED FUNCTION DEMO ===');
  log('Testing rate-limited API calls (max 2 concurrent)');

  let callCount = 0;
  const apiCall = rateLimited(async (endpoint: string) => {
    callCount++;
    const current = callCount;
    log(`API call ${current} to ${endpoint} started`);
    await delay(50);
    log(`API call ${current} completed`);
    return { endpoint, data: `Response from ${endpoint}` };
  }, 2);

  const start = Date.now();
  const results = await Promise.all([
    apiCall('/users'),
    apiCall('/posts'),
    apiCall('/comments'),
    apiCall('/likes'),
  ]);
  log(`All API calls completed in ${Date.now() - start}ms`);
  log('Results:', results.map(r => r.endpoint).join(', '));
}

async function demoUUIDCache() {
  console.log('\n=== UUID CACHE DEMO ===');
  log('Testing deterministic UUID generation with caching');

  const cache = new UUIDCache({ maxSize: 1000 });

  // Generate UUIDs for different agent-entity pairs
  const pairs = [
    ['agent-1', 'room-abc'],
    ['agent-1', 'room-xyz'],
    ['agent-2', 'room-abc'],
    ['agent-1', 'room-abc'], // Duplicate - should use cache
  ];

  for (const [agentId, entityId] of pairs) {
    const uuid = cache.getSwizzledUUID(agentId, entityId);
    log(`UUID for ${agentId}:${entityId} = ${uuid}`);
  }

  // Verify deterministic
  const uuid1 = cache.getSwizzledUUID('agent-1', 'room-abc');
  const uuid2 = cache.getSwizzledUUID('agent-1', 'room-abc');
  log(`UUIDs are deterministic: ${uuid1 === uuid2}`);

  // Batch generation
  const batchUUIDs = cache.getSwizzledUUIDs('agent-3', ['e1', 'e2', 'e3']);
  log(`Batch generated ${batchUUIDs.size} UUIDs`);
}

async function demoMemoization() {
  console.log('\n=== MEMOIZATION DEMO ===');
  log('Testing sync and async memoization');

  let computeCount = 0;
  const expensiveComputation = memoize((x: number, y: number) => {
    computeCount++;
    log(`Computing ${x} * ${y}...`);
    return x * y;
  });

  log('First call: ' + expensiveComputation(5, 10));
  log('Second call (cached): ' + expensiveComputation(5, 10));
  log('Different args: ' + expensiveComputation(3, 7));
  log(`Total computations: ${computeCount}`);

  // Async memoization with deduplication
  let asyncCallCount = 0;
  const asyncFetch = memoizeAsync(async (url: string) => {
    asyncCallCount++;
    log(`Fetching ${url}...`);
    await delay(50);
    return { url, data: 'fetched' };
  });

  // Concurrent calls to same URL get deduplicated
  const [r1, r2] = await Promise.all([
    asyncFetch('/api/data'),
    asyncFetch('/api/data'),
  ]);
  log(`Async calls made: ${asyncCallCount} (should be 1)`);
}

async function demoMessageQueue() {
  console.log('\n=== MESSAGE QUEUE DEMO ===');
  log('Testing concurrent message processing with queue');

  const queue = new MessageQueueService<{ text: string; priority: number }>({
    concurrency: 2,
    maxAttempts: 3,
  });

  const processed: string[] = [];

  // Register handler
  queue.onMessage('agent-1', async (msg) => {
    log(`Processing message: "${msg.payload.text}" (priority: ${msg.payload.priority})`);
    await delay(50);
    processed.push(msg.payload.text);
    log(`Completed: "${msg.payload.text}"`);
  });

  // Enqueue messages with different priorities
  log('Enqueueing messages...');
  queue.enqueue('agent-1', { text: 'Low priority', priority: 0 }, { priority: 0 });
  queue.enqueue('agent-1', { text: 'High priority', priority: 10 }, { priority: 10 });
  queue.enqueue('agent-1', { text: 'Medium priority', priority: 5 }, { priority: 5 });
  queue.enqueue('agent-1', { text: 'Another low', priority: 0 }, { priority: 0 });

  // Wait for processing
  await delay(300);

  const stats = queue.getStats().get('agent-1');
  log('Queue stats:', stats);
  log('Processed order:', processed);
}

async function demoConcurrentRuntime() {
  console.log('\n=== CONCURRENT RUNTIME DEMO ===');
  log('Testing integrated concurrent runtime');

  const runtime = createConcurrentRuntime({
    ...DEVELOPMENT_CONFIG,
    actionConcurrency: 3,
  });

  // Register handler
  runtime.registerHandler('test-agent', async (message, context) => {
    const roomUUID = context.getSwizzledUUID(message.roomId || 'default');
    log(`Processing: "${message.content}" in room ${roomUUID.substring(0, 8)}...`);
    await delay(30);
    log(`Completed: "${message.content}"`);
  });

  runtime.start();

  // Enqueue multiple messages
  log('Sending batch of messages...');
  await runtime.enqueueBatch([
    { id: 'm1', agentId: 'test-agent', content: 'Hello', roomId: 'room-1' },
    { id: 'm2', agentId: 'test-agent', content: 'World', roomId: 'room-1' },
    { id: 'm3', agentId: 'test-agent', content: 'Concurrent', roomId: 'room-2' },
    { id: 'm4', agentId: 'test-agent', content: 'Processing', roomId: 'room-2' },
    { id: 'm5', agentId: 'test-agent', content: 'Test', roomId: 'room-3' },
  ]);

  await delay(200);

  const metrics = runtime.getMetrics();
  log('Runtime metrics:', {
    processed: metrics.messagesProcessed,
    avgTime: `${metrics.avgProcessingTime.toFixed(2)}ms`,
    errors: metrics.errors,
  });

  await runtime.stop();
}

async function demoRequestCache() {
  console.log('\n=== REQUEST CACHE DEMO ===');
  log('Testing API request caching and deduplication');

  const cache = new RequestCache({ defaultTtl: 1000, maxEntries: 100 });
  let fetchCount = 0;

  const fetchData = async (url: string) => {
    return cache.getOrFetch(url, async () => {
      fetchCount++;
      log(`Actual fetch #${fetchCount}: ${url}`);
      await delay(30);
      return { url, timestamp: Date.now() };
    });
  };

  // First fetch
  const r1 = await fetchData('/api/users');
  log('First result:', r1.url);

  // Cached fetch
  const r2 = await fetchData('/api/users');
  log('Cached result (same timestamp):', r2.timestamp === r1.timestamp);

  // Concurrent fetches to same URL
  const [r3, r4] = await Promise.all([
    fetchData('/api/posts'),
    fetchData('/api/posts'),
  ]);
  log('Concurrent fetches deduplicated:', r3.timestamp === r4.timestamp);

  log(`Total actual fetches: ${fetchCount} (should be 2)`);
  log('Cache stats:', cache.getStats());
}

async function demoBatchProcessor() {
  console.log('\n=== BATCH PROCESSOR DEMO ===');
  log('Testing automatic request batching');

  let batchCount = 0;

  const processor = new BatchProcessor<string, { id: string; name: string }>(
    async (ids) => {
      batchCount++;
      log(`Batch #${batchCount}: Processing ${ids.length} items: [${ids.join(', ')}]`);
      await delay(50);
      return ids.map(id => ({ id, name: `User ${id}` }));
    },
    { maxBatchSize: 3, maxDelay: 20 }
  );

  // Add items rapidly
  const results = await Promise.all([
    processor.add('user-1'),
    processor.add('user-2'),
    processor.add('user-3'),
    processor.add('user-4'),
    processor.add('user-5'),
  ]);

  log(`Results: ${results.map(r => r.name).join(', ')}`);
  log(`Total batches: ${batchCount}`);
}

async function demoPagination() {
  console.log('\n=== PAGINATION DEMO ===');
  log('Testing cursor-based pagination');

  const allData = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

  const paginator = new CursorPaginator(
    async (params) => {
      const startIndex = params.cursor ? parseInt(params.cursor) : 0;
      const limit = params.limit ?? 5;
      const items = allData.slice(startIndex, startIndex + limit);
      const nextIndex = startIndex + limit;
      log(`Fetched items ${startIndex + 1}-${startIndex + items.length}`);
      return {
        items,
        nextCursor: nextIndex < allData.length ? String(nextIndex) : undefined,
        hasMore: nextIndex < allData.length,
      };
    },
    { limit: 5 }
  );

  // Fetch first 3 pages
  const page1 = await paginator.next();
  log(`Page 1: ${page1.map(i => i.id).join(', ')}`);

  const page2 = await paginator.next();
  log(`Page 2: ${page2.map(i => i.id).join(', ')}`);

  const page3 = await paginator.next();
  log(`Page 3: ${page3.map(i => i.id).join(', ')}`);

  log(`Has more: ${paginator.hasMore}`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       ELIZAOS CONCURRENCY STREAMLINING DEMO                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demoSemaphore();
    await demoRateLimited();
    await demoUUIDCache();
    await demoMemoization();
    await demoMessageQueue();
    await demoConcurrentRuntime();
    await demoRequestCache();
    await demoBatchProcessor();
    await demoPagination();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ALL DEMOS COMPLETED                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('Demo error:', error);
    process.exit(1);
  }
}

main();
