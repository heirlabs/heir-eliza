/**
 * WebSocket/Realtime Service for ElizaOS Client.
 * Provides real-time event streaming to replace HTTP polling.
 */

export interface RealtimeConfig {
  /** Base URL of the ElizaOS server */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Reconnect attempts before giving up */
  maxReconnectAttempts?: number;
  /** Base delay for reconnect (ms) */
  reconnectDelay?: number;
  /** Maximum reconnect delay (ms) */
  maxReconnectDelay?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Connection timeout (ms) */
  connectionTimeout?: number;
}

export interface AgentEvent {
  type: string;
  agentId: string;
  timestamp: number;
  data: unknown;
}

export interface MessageEvent {
  type: 'message';
  agentId: string;
  sessionId: string;
  messageId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface JobEvent {
  type: 'job_status';
  agentId: string;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  timestamp: number;
}

export interface RunEvent {
  type: 'run_event';
  agentId: string;
  runId: string;
  eventType: string;
  data: unknown;
  timestamp: number;
}

export type RealtimeEvent = MessageEvent | JobEvent | RunEvent | AgentEvent;

type EventHandler<T = RealtimeEvent> = (event: T) => void;
type ErrorHandler = (error: Error) => void;
type ConnectionHandler = () => void;

/**
 * WebSocket-based realtime service for ElizaOS.
 */
export class RealtimeService {
  private socket: WebSocket | null = null;
  private subscriptions = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private connectHandlers = new Set<ConnectionHandler>();
  private disconnectHandlers = new Set<ConnectionHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private readonly config: Required<RealtimeConfig>;
  private pendingSubscriptions = new Set<string>();

  constructor(config: RealtimeConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ?? '',
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      connectionTimeout: config.connectionTimeout ?? 10000,
    };
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const onConnect = () => {
          this.offConnect(onConnect);
          this.offError(onError);
          resolve();
        };
        const onError = (error: Error) => {
          this.offConnect(onConnect);
          this.offError(onError);
          reject(error);
        };
        this.onConnect(onConnect);
        this.onError(onError);
      });
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      const wsUrl = this.config.baseUrl.replace(/^http/, 'ws') + '/ws';

      const connectionTimeout = setTimeout(() => {
        if (this.socket?.readyState !== WebSocket.OPEN) {
          this.socket?.close();
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeout);

      try {
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Authenticate if API key provided
          if (this.config.apiKey) {
            this.send({
              type: 'auth',
              apiKey: this.config.apiKey,
            });
          }

          // Resubscribe to pending subscriptions
          for (const agentId of this.pendingSubscriptions) {
            this.send({ type: 'subscribe', agentId });
          }
          this.pendingSubscriptions.clear();

          // Resubscribe to existing subscriptions
          for (const agentId of this.subscriptions.keys()) {
            this.send({ type: 'subscribe', agentId });
          }

          this.startHeartbeat();
          this.notifyConnect();
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as RealtimeEvent;
            this.handleMessage(data);
          } catch {
            // Ignore parse errors
          }
        };

        this.socket.onerror = () => {
          clearTimeout(connectionTimeout);
          const error = new Error('WebSocket error');
          this.notifyError(error);
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(error);
          }
        };

        this.socket.onclose = () => {
          clearTimeout(connectionTimeout);
          this.stopHeartbeat();
          this.notifyDisconnect();

          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Subscribe to events for a specific agent.
   */
  subscribe(agentId: string, handler: EventHandler): () => void {
    if (!this.subscriptions.has(agentId)) {
      this.subscriptions.set(agentId, new Set());

      // Send subscribe message if connected
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: 'subscribe', agentId });
      } else {
        this.pendingSubscriptions.add(agentId);
      }
    }

    this.subscriptions.get(agentId)!.add(handler);

    return () => {
      const handlers = this.subscriptions.get(agentId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(agentId);
          this.send({ type: 'unsubscribe', agentId });
        }
      }
    };
  }

  /**
   * Subscribe to all events.
   */
  subscribeAll(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  /**
   * Wait for a specific event.
   */
  waitFor<T extends RealtimeEvent>(
    agentId: string,
    predicate: (event: RealtimeEvent) => event is T,
    timeout?: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = timeout
        ? setTimeout(() => {
            unsubscribe();
            reject(new Error('Event wait timeout'));
          }, timeout)
        : null;

      const unsubscribe = this.subscribe(agentId, (event) => {
        if (predicate(event)) {
          if (timeoutId) clearTimeout(timeoutId);
          unsubscribe();
          resolve(event);
        }
      });
    });
  }

  /**
   * Wait for a job to complete.
   */
  async waitForJob(agentId: string, jobId: string, timeout = 30000): Promise<JobEvent> {
    return this.waitFor<JobEvent>(
      agentId,
      (event): event is JobEvent => {
        if (event.type !== 'job_status') return false;
        const jobEvent = event as JobEvent;
        return jobEvent.jobId === jobId &&
          (jobEvent.status === 'completed' || jobEvent.status === 'failed');
      },
      timeout
    );
  }

  /**
   * Wait for a message from the assistant.
   */
  async waitForMessage(
    agentId: string,
    sessionId: string,
    timeout = 30000
  ): Promise<MessageEvent> {
    return this.waitFor<MessageEvent>(
      agentId,
      (event): event is MessageEvent => {
        if (event.type !== 'message') return false;
        const msgEvent = event as MessageEvent;
        return msgEvent.sessionId === sessionId && msgEvent.role === 'assistant';
      },
      timeout
    );
  }

  /**
   * Register error handler.
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * Unregister error handler.
   */
  offError(handler: ErrorHandler): void {
    this.errorHandlers.delete(handler);
  }

  /**
   * Register connect handler.
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => {
      this.connectHandlers.delete(handler);
    };
  }

  /**
   * Unregister connect handler.
   */
  offConnect(handler: ConnectionHandler): void {
    this.connectHandlers.delete(handler);
  }

  /**
   * Register disconnect handler.
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  /**
   * Check if connected.
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state.
   */
  get state(): 'connected' | 'connecting' | 'disconnected' {
    if (this.socket?.readyState === WebSocket.OPEN) return 'connected';
    if (this.isConnecting) return 'connecting';
    return 'disconnected';
  }

  private send(data: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  private handleMessage(event: RealtimeEvent): void {
    // Notify global handlers
    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }

    // Notify agent-specific handlers
    const handlers = this.subscriptions.get(event.agentId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  private notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore
      }
    }
  }

  private notifyConnect(): void {
    for (const handler of this.connectHandlers) {
      try {
        handler();
      } catch {
        // Ignore
      }
    }
  }

  private notifyDisconnect(): void {
    for (const handler of this.disconnectHandlers) {
      try {
        handler();
      } catch {
        // Ignore
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.notifyError(new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Error handled by notifyError
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/**
 * Create a realtime service instance.
 */
export function createRealtimeService(config: RealtimeConfig): RealtimeService {
  return new RealtimeService(config);
}

/**
 * Event type guards.
 */
export function isMessageEvent(event: RealtimeEvent): event is MessageEvent {
  return event.type === 'message';
}

export function isJobEvent(event: RealtimeEvent): event is JobEvent {
  return event.type === 'job_status';
}

export function isRunEvent(event: RealtimeEvent): event is RunEvent {
  return event.type === 'run_event';
}
