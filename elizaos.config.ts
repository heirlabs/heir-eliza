/**
 * ElizaOS Production Configuration
 *
 * This configuration is optimized for scaling to 2000+ per-user agents.
 * Environment variables can override these defaults.
 */

// MongoDB Configuration
// If MONGODB_URI is set, use MongoDB instead of SQL
const USE_MONGODB = !!process.env.MONGODB_URI || process.env.USE_MONGODB === 'true';

// Read scaling config from environment
const poolMin = parseInt(process.env.ELIZA_DB_POOL_MIN || '10');
const poolMax = parseInt(process.env.ELIZA_DB_POOL_MAX || '100');
const poolIdleTimeout = parseInt(process.env.ELIZA_DB_IDLE_TIMEOUT || '60000');
const queueConcurrency = parseInt(process.env.ELIZA_QUEUE_CONCURRENCY || '20');
const queueMaxSize = parseInt(process.env.ELIZA_QUEUE_MAX_SIZE || '100000');
const actionConcurrency = parseInt(process.env.ELIZA_ACTION_CONCURRENCY || '50');
const uuidCacheSize = parseInt(process.env.ELIZA_UUID_CACHE_SIZE || '100000');
const memoizeProviders = process.env.ELIZA_MEMOIZE_PROVIDERS === 'true';

// Export MongoDB usage flag
export const useMongoDB = USE_MONGODB;

/**
 * Production-optimized runtime configuration
 * For use with ConcurrentRuntime
 */
export const productionConfig = {
  // Connection pool for PostgreSQL
  connectionPool: {
    min: poolMin,
    max: poolMax,
    idleTimeout: poolIdleTimeout,
    acquireTimeout: 15000,
    createTimeout: 10000,
    healthCheckInterval: 30000,
    maxLifetime: 3600000, // 1 hour
    healthCheckQuery: 'SELECT 1',
  },

  // Message queue for per-agent processing
  messageQueue: {
    concurrency: queueConcurrency,
    maxAttempts: 3,
    retryDelay: 2000,
    messageTtl: 7200000, // 2 hours
    maxQueueSize: queueMaxSize,
  },

  // Semaphore for action handler concurrency
  actionConcurrency: {
    maxPermits: actionConcurrency,
    acquireTimeout: 30000,
  },

  // Service pool for shared resources
  servicePool: {
    minSize: 5,
    maxSize: 50,
    idleTimeout: 120000,
    acquireTimeout: 30000,
    healthCheckInterval: 30000,
    validateOnAcquire: true,
  },

  // UUID cache for agent isolation (swizzling)
  uuidCacheSize: uuidCacheSize,

  // Enable provider memoization for performance
  memoizeProviders: memoizeProviders,
};

/**
 * Development configuration (smaller limits)
 */
export const developmentConfig = {
  connectionPool: {
    min: 2,
    max: 20,
    idleTimeout: 30000,
    acquireTimeout: 10000,
    createTimeout: 5000,
    healthCheckInterval: 30000,
    maxLifetime: 3600000,
  },

  messageQueue: {
    concurrency: 5,
    maxAttempts: 1,
    retryDelay: 500,
    messageTtl: 600000, // 10 minutes
    maxQueueSize: 1000,
  },

  actionConcurrency: 5,

  servicePool: {
    minSize: 2,
    maxSize: 10,
    idleTimeout: 60000,
    acquireTimeout: 30000,
    healthCheckInterval: 30000,
    validateOnAcquire: true,
  },

  uuidCacheSize: 1000,
  memoizeProviders: false,
};

/**
 * Get the appropriate configuration based on NODE_ENV
 */
export function getRuntimeConfig() {
  return process.env.NODE_ENV === 'production'
    ? productionConfig
    : developmentConfig;
}

export default getRuntimeConfig();
