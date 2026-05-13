/**
 * Enhanced API Client with built-in concurrency optimizations.
 * Integrates caching, batching, real-time events, and cursor pagination.
 */

import { RequestCache, type RequestCacheOptions } from '../lib/requestCache';
import { RealtimeService, type RealtimeConfig, type RealtimeEvent, type JobEvent, type MessageEvent } from '../lib/realtimeService';
import { BatchProcessor, BatchRequestAggregator, type BatchConfig } from '../lib/batchOperations';
import { CursorPaginator, type CursorPaginationParams, type CursorPaginationResult, type PaginatedFetcher } from '../lib/pagination';

/**
 * Enhanced client configuration.
 */
export interface EnhancedClientConfig {
  /** Base URL of the ElizaOS server */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Enable request caching */
  enableCache?: boolean;
  /** Cache configuration */
  cacheConfig?: RequestCacheOptions;
  /** Enable WebSocket for real-time events */
  enableRealtime?: boolean;
  /** Realtime configuration */
  realtimeConfig?: Partial<RealtimeConfig>;
  /** Enable request batching */
  enableBatching?: boolean;
  /** Batch configuration */
  batchConfig?: BatchConfig;
}

/**
 * API response envelope.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

/**
 * Session data.
 */
export interface Session {
  id: string;
  agentId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Message data.
 */
export interface Message {
  id: string;
  sessionId: string;
  agentId: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
}

/**
 * Job data.
 */
export interface Job {
  id: string;
  agentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content: string;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Agent data.
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'stopped';
  createdAt: Date;
}

/**
 * Enhanced ElizaOS API Client.
 */
export class EnhancedClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private cache?: RequestCache;
  private realtime?: RealtimeService;
  private agentBatcher?: BatchRequestAggregator<string, Agent>;
  private messageBatcher?: BatchProcessor<{ sessionId: string; content: string }, Message>;
  private readonly headers: Record<string, string>;

  constructor(config: EnhancedClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;

    this.headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      this.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Initialize cache
    if (config.enableCache !== false) {
      this.cache = new RequestCache(config.cacheConfig);
    }

    // Initialize realtime
    if (config.enableRealtime) {
      this.realtime = new RealtimeService({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        ...config.realtimeConfig,
      });
    }

    // Initialize batchers
    if (config.enableBatching) {
      this.initializeBatchers(config.batchConfig);
    }
  }

  private initializeBatchers(config?: BatchConfig): void {
    // Agent batcher for bulk agent lookups
    this.agentBatcher = new BatchRequestAggregator(
      async (ids: string[]) => {
        const response = await this.request<Agent[]>('POST', '/agents/batch', { ids });
        const result = new Map<string, Agent>();
        for (const agent of response) {
          result.set(agent.id, agent);
        }
        return result;
      },
      (id) => id,
      config
    );

    // Message batcher for bulk message sending
    this.messageBatcher = new BatchProcessor(
      async (inputs) => {
        const response = await this.request<Message[]>('POST', '/messages/batch', {
          messages: inputs,
        });
        return response;
      },
      config
    );
  }

  /**
   * Connect to realtime service.
   */
  async connectRealtime(): Promise<void> {
    if (!this.realtime) {
      throw new Error('Realtime not enabled');
    }
    await this.realtime.connect();
  }

  /**
   * Disconnect from realtime service.
   */
  disconnectRealtime(): void {
    this.realtime?.disconnect();
  }

  /**
   * Subscribe to agent events.
   */
  subscribeToAgent(agentId: string, handler: (event: RealtimeEvent) => void): () => void {
    if (!this.realtime) {
      throw new Error('Realtime not enabled');
    }
    return this.realtime.subscribe(agentId, handler);
  }

  // Session Management

  /**
   * Create a new session.
   */
  async createSession(
    agentId: string,
    options?: { userId?: string; metadata?: Record<string, unknown> }
  ): Promise<Session> {
    return this.request<Session>('POST', '/sessions', {
      agentId,
      ...options,
    });
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<Session> {
    return this.cachedRequest<Session>('GET', `/sessions/${sessionId}`, undefined, 5000);
  }

  /**
   * List sessions with pagination.
   */
  listSessions(agentId?: string): CursorPaginator<Session> {
    const fetcher: PaginatedFetcher<Session> = async (params) => {
      const query = new URLSearchParams();
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));
      if (agentId) query.set('agentId', agentId);

      const response = await this.request<CursorPaginationResult<Session>>(
        'GET',
        `/sessions?${query.toString()}`
      );
      return response;
    };

    return new CursorPaginator(fetcher);
  }

  // Message Management

  /**
   * Send a message to an agent.
   */
  async sendMessage(sessionId: string, content: string): Promise<Message> {
    // Use batcher if available
    if (this.messageBatcher) {
      return this.messageBatcher.add({ sessionId, content });
    }

    return this.request<Message>('POST', `/sessions/${sessionId}/messages`, {
      content,
    });
  }

  /**
   * Send message and wait for response using realtime.
   */
  async sendMessageAndWait(
    sessionId: string,
    content: string,
    timeout = 30000
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    if (!this.realtime) {
      throw new Error('Realtime not enabled - use sendMessage instead');
    }

    // Get session to find agent ID
    const session = await this.getSession(sessionId);

    // Send message
    const userMessage = await this.sendMessage(sessionId, content);

    // Wait for assistant response
    const event = await this.realtime.waitForMessage(session.agentId, sessionId, timeout);

    const assistantMessage: Message = {
      id: event.messageId,
      sessionId: event.sessionId,
      agentId: event.agentId,
      content: event.content,
      role: 'assistant',
      createdAt: new Date(event.timestamp),
    };

    return { userMessage, assistantMessage };
  }

  /**
   * List messages with pagination.
   */
  listMessages(sessionId: string): CursorPaginator<Message> {
    const fetcher: PaginatedFetcher<Message> = async (params) => {
      const query = new URLSearchParams();
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));

      const response = await this.request<CursorPaginationResult<Message>>(
        'GET',
        `/sessions/${sessionId}/messages?${query.toString()}`
      );
      return response;
    };

    return new CursorPaginator(fetcher);
  }

  // Job Management

  /**
   * Create a job (one-off message with result).
   */
  async createJob(agentId: string, content: string): Promise<Job> {
    return this.request<Job>('POST', '/jobs', { agentId, content });
  }

  /**
   * Create a job and wait for completion using realtime.
   */
  async askAndWait(agentId: string, content: string, timeout = 30000): Promise<Job> {
    if (!this.realtime) {
      // Fall back to polling
      return this.askWithPolling(agentId, content, timeout);
    }

    const job = await this.createJob(agentId, content);

    const event = await this.realtime.waitForJob(agentId, job.id, timeout);

    return {
      ...job,
      status: event.status,
      result: event.result,
      error: event.error,
      completedAt: new Date(event.timestamp),
    };
  }

  /**
   * Ask with polling fallback.
   */
  private async askWithPolling(
    agentId: string,
    content: string,
    timeout: number
  ): Promise<Job> {
    const job = await this.createJob(agentId, content);
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      const status = await this.getJob(job.id);

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Job timeout');
  }

  /**
   * Get job status.
   */
  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>('GET', `/jobs/${jobId}`);
  }

  // Agent Management

  /**
   * Get an agent by ID (with batching if enabled).
   */
  async getAgent(agentId: string): Promise<Agent> {
    if (this.agentBatcher) {
      const result = await this.agentBatcher.get(agentId);
      if (!result) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      return result;
    }

    return this.cachedRequest<Agent>('GET', `/agents/${agentId}`, undefined, 30000);
  }

  /**
   * List agents with pagination.
   */
  listAgents(): CursorPaginator<Agent> {
    const fetcher: PaginatedFetcher<Agent> = async (params) => {
      const query = new URLSearchParams();
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));

      const response = await this.request<CursorPaginationResult<Agent>>(
        'GET',
        `/agents?${query.toString()}`
      );
      return response;
    };

    return new CursorPaginator(fetcher);
  }

  // Utility Methods

  /**
   * Make a cached HTTP request.
   */
  private async cachedRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    ttl?: number
  ): Promise<T> {
    if (this.cache && method === 'GET') {
      const url = `${this.baseUrl}${path}`;
      return this.cache.getOrFetch(url, () => this.request<T>(method, path, body), undefined, ttl);
    }

    return this.request<T>(method, path, body);
  }

  /**
   * Make an HTTP request.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? `HTTP ${response.status}`);
      }

      const result = (await response.json()) as ApiResponse<T>;

      if (!result.success && result.error) {
        throw new Error(result.error.message);
      }

      return result.data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  /**
   * Invalidate cache for a specific path pattern.
   */
  invalidateCache(pattern: string | RegExp): void {
    this.cache?.invalidate(pattern);
  }

  /**
   * Clear all cache entries.
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; maxEntries: number; pendingRequests: number } | undefined {
    return this.cache?.getStats();
  }

  /**
   * Check if realtime is connected.
   */
  get isRealtimeConnected(): boolean {
    return this.realtime?.isConnected ?? false;
  }
}

/**
 * Create an enhanced client instance.
 */
export function createEnhancedClient(config: EnhancedClientConfig): EnhancedClient {
  return new EnhancedClient(config);
}

/**
 * Recommended production client configuration.
 */
export const PRODUCTION_CLIENT_CONFIG: Partial<EnhancedClientConfig> = {
  timeout: 30000,
  enableCache: true,
  cacheConfig: {
    defaultTtl: 5000,
    maxEntries: 1000,
  },
  enableRealtime: true,
  enableBatching: true,
  batchConfig: {
    maxBatchSize: 50,
    maxDelay: 10,
  },
};

/**
 * Recommended development client configuration.
 */
export const DEVELOPMENT_CLIENT_CONFIG: Partial<EnhancedClientConfig> = {
  timeout: 60000,
  enableCache: false,
  enableRealtime: false,
  enableBatching: false,
};
