/**
 * API Client Library Index
 * Exports all library modules for enhanced client operations.
 */

// Request caching and deduplication
export {
  RequestCache,
  RequestDeduplicator,
  SWRCache,
  cached,
  createCachedFetch,
  type RequestCacheOptions,
  type CacheEntry,
} from './requestCache';

// WebSocket/Realtime service
export {
  RealtimeService,
  createRealtimeService,
  isMessageEvent,
  isJobEvent,
  isRunEvent,
  type RealtimeConfig,
  type AgentEvent,
  type MessageEvent,
  type JobEvent,
  type RunEvent,
  type RealtimeEvent,
} from './realtimeService';

// Batch operations
export {
  BatchProcessor,
  BatchRequestAggregator,
  createBatchMessageSender,
  createBatchMemoryOperator,
  batched,
  type BatchConfig,
  type BatchOperation,
  type BatchMessage,
  type BatchMessageResult,
  type BatchMemoryOperation,
  type BatchMemoryResult,
} from './batchOperations';

// Cursor-based pagination
export {
  CursorPaginator,
  BiDirectionalPaginator,
  InfiniteScrollLoader,
  createCursor,
  parseCursor,
  streamPaginated,
  fetchPaginatedParallel,
  type CursorPaginationParams,
  type CursorPaginationResult,
  type PaginatedFetcher,
  type InfiniteScrollState,
} from './pagination';
