/**
 * Batch Operations utilities for ElizaOS API Client.
 * Reduces request count by batching multiple operations.
 */

export interface BatchConfig {
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Maximum delay before flushing batch (ms) */
  maxDelay?: number;
  /** Whether to preserve order of operations */
  preserveOrder?: boolean;
}

export interface BatchOperation<TInput, TOutput> {
  input: TInput;
  resolve: (output: TOutput) => void;
  reject: (error: Error) => void;
}

type BatchExecutor<TInput, TOutput> = (inputs: TInput[]) => Promise<TOutput[]>;

/**
 * Automatic batching for API operations.
 */
export class BatchProcessor<TInput, TOutput> {
  private queue: BatchOperation<TInput, TOutput>[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<BatchConfig>;

  constructor(
    private readonly executor: BatchExecutor<TInput, TOutput>,
    config: BatchConfig = {}
  ) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 50,
      maxDelay: config.maxDelay ?? 10,
      preserveOrder: config.preserveOrder ?? true,
    };
  }

  /**
   * Add an operation to the batch.
   */
  add(input: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input, resolve, reject });

      if (this.queue.length >= this.config.maxBatchSize) {
        this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.config.maxDelay);
      }
    });
  }

  /**
   * Flush the current batch immediately.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.config.maxBatchSize);
    const inputs = batch.map((op) => op.input);

    try {
      const outputs = await this.executor(inputs);

      if (this.config.preserveOrder && outputs.length !== batch.length) {
        throw new Error('Batch executor returned wrong number of results');
      }

      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(outputs[i]);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const op of batch) {
        op.reject(err);
      }
    }

    // Continue flushing if more items queued
    if (this.queue.length > 0) {
      this.flushTimer = setTimeout(() => this.flush(), this.config.maxDelay);
    }
  }

  /**
   * Get the current queue size.
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue without executing.
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const error = new Error('Batch cleared');
    for (const op of this.queue) {
      op.reject(error);
    }
    this.queue = [];
  }
}

/**
 * Batch message sending for a channel.
 */
export interface BatchMessage {
  channelId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface BatchMessageResult {
  messageId: string;
  channelId: string;
  success: boolean;
  error?: string;
}

/**
 * Create a batch message sender.
 */
export function createBatchMessageSender(
  sendBatch: (messages: BatchMessage[]) => Promise<BatchMessageResult[]>,
  config?: BatchConfig
): {
  send: (message: BatchMessage) => Promise<BatchMessageResult>;
  flush: () => Promise<void>;
} {
  const processor = new BatchProcessor(sendBatch, config);

  return {
    send: (message) => processor.add(message),
    flush: () => processor.flush(),
  };
}

/**
 * Batch memory operations.
 */
export interface BatchMemoryOperation {
  type: 'create' | 'update' | 'delete';
  agentId: string;
  memoryId?: string;
  data?: Record<string, unknown>;
}

export interface BatchMemoryResult {
  memoryId: string;
  success: boolean;
  error?: string;
}

/**
 * Create a batch memory operator.
 */
export function createBatchMemoryOperator(
  executeBatch: (operations: BatchMemoryOperation[]) => Promise<BatchMemoryResult[]>,
  config?: BatchConfig
): {
  execute: (operation: BatchMemoryOperation) => Promise<BatchMemoryResult>;
  flush: () => Promise<void>;
} {
  const processor = new BatchProcessor(executeBatch, config);

  return {
    execute: (operation) => processor.add(operation),
    flush: () => processor.flush(),
  };
}

/**
 * Batch request aggregator for GET requests.
 * Aggregates multiple individual ID lookups into a single batch request.
 */
export class BatchRequestAggregator<TId, TResult> {
  private pending = new Map<
    string,
    Array<{
      id: TId;
      resolve: (result: TResult | undefined) => void;
      reject: (error: Error) => void;
    }>
  >();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly config: Required<BatchConfig>;

  constructor(
    private readonly fetcher: (ids: TId[]) => Promise<Map<TId, TResult>>,
    private readonly keyGenerator: (id: TId) => string = (id) => String(id),
    config: BatchConfig = {}
  ) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 100,
      maxDelay: config.maxDelay ?? 5,
      preserveOrder: config.preserveOrder ?? false,
    };
  }

  /**
   * Get a single item, batched with other requests.
   */
  get(id: TId, batchKey = 'default'): Promise<TResult | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.pending.has(batchKey)) {
        this.pending.set(batchKey, []);
      }

      this.pending.get(batchKey)!.push({ id, resolve, reject });

      if (this.pending.get(batchKey)!.length >= this.config.maxBatchSize) {
        this.flushBatch(batchKey);
      } else if (!this.flushTimers.has(batchKey)) {
        this.flushTimers.set(
          batchKey,
          setTimeout(() => this.flushBatch(batchKey), this.config.maxDelay)
        );
      }
    });
  }

  /**
   * Get multiple items at once.
   */
  async getMany(ids: TId[], batchKey = 'default'): Promise<Map<TId, TResult>> {
    const results = await Promise.all(ids.map((id) => this.get(id, batchKey)));
    const resultMap = new Map<TId, TResult>();

    for (let i = 0; i < ids.length; i++) {
      const result = results[i];
      if (result !== undefined) {
        resultMap.set(ids[i], result);
      }
    }

    return resultMap;
  }

  private async flushBatch(batchKey: string): Promise<void> {
    const timer = this.flushTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(batchKey);
    }

    const batch = this.pending.get(batchKey);
    if (!batch || batch.length === 0) return;

    this.pending.delete(batchKey);

    // Deduplicate IDs
    const idMap = new Map<string, TId>();
    for (const item of batch) {
      const key = this.keyGenerator(item.id);
      if (!idMap.has(key)) {
        idMap.set(key, item.id);
      }
    }

    const uniqueIds = Array.from(idMap.values());

    try {
      const results = await this.fetcher(uniqueIds);

      for (const item of batch) {
        const key = this.keyGenerator(item.id);
        const result = results.get(idMap.get(key)!);
        item.resolve(result);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const item of batch) {
        item.reject(err);
      }
    }
  }

  /**
   * Clear all pending batches.
   */
  clear(): void {
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();

    const error = new Error('Batch aggregator cleared');
    for (const batch of this.pending.values()) {
      for (const item of batch) {
        item.reject(error);
      }
    }
    this.pending.clear();
  }
}

/**
 * Decorator for batch-enabling a method.
 */
export function batched<TInput, TOutput>(
  batchExecutor: BatchExecutor<TInput, TOutput>,
  config?: BatchConfig
) {
  const processor = new BatchProcessor(batchExecutor, config);

  return function <T extends (input: TInput) => Promise<TOutput>>(
    _target: object,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    descriptor.value = ((input: TInput) => processor.add(input)) as T;
    return descriptor;
  };
}
