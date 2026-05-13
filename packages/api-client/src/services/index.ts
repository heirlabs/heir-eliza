/**
 * API Client Services Index
 * Exports all service modules for enhanced client operations.
 */

// Enhanced Client with built-in concurrency optimizations
export {
  EnhancedClient,
  EnhancedClient as ElizaClient, // Alias for backward compatibility
  createEnhancedClient,
  PRODUCTION_CLIENT_CONFIG,
  DEVELOPMENT_CLIENT_CONFIG,
  type EnhancedClientConfig,
  type EnhancedClientConfig as ApiClientConfig, // Alias for backward compatibility
  type ApiResponse,
  type Session,
  type Message,
  type Job,
  type Agent,
} from './enhancedClient';

// Agent and Memory services for CLI compatibility
export { AgentsService, MemoryService } from './agentService';

// Compatibility types for client package
export type {
  RunDetail,
  RunSummary,
  ListRunsParams,
  ServerMetadata,
  ChannelMetadata,
  MessageMetadata,
  AgentLog,
  MessageChannel,
  MessageServer,
  Memory,
  AgentWithTimestamps,
  MessageWithMetadata,
} from './compatibilityTypes';
