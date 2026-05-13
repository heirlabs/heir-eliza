/**
 * ElizaOS API Client Package
 * Type-safe API client with enhanced concurrency support.
 *
 * @packageDocumentation
 */

// Export all library utilities
export * from './lib/index';

// Export all services
export * from './services/index';

// Re-export commonly used types for convenience
export type {
  RequestCacheOptions,
  RealtimeConfig,
  AgentEvent,
  MessageEvent,
  JobEvent,
  RunEvent,
  BatchConfig,
  CursorPaginationParams,
  CursorPaginationResult,
  InfiniteScrollState,
} from './lib/index';

export type {
  EnhancedClientConfig,
  ApiResponse,
  Session,
  Message,
  Job,
  Agent,
} from './services/index';
