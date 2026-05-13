/**
 * MongoDB Agent Initialization
 * 
 * Provides agent initialization using MongoDB as the database adapter.
 */

import { createMongoDBAdapter } from './adapter';
import { connectDB, disconnectDB, isConnected } from './db';

const SERVICE = 'mongodb-agent';

interface AgentSingletonState {
  adapter: ReturnType<typeof createMongoDBAdapter> | null;
  isInitializing: boolean;
  initPromise: Promise<ReturnType<typeof createMongoDBAdapter> | null> | null;
  initError: Error | null;
  startTime: number | null;
}

function getSingleton(): AgentSingletonState {
  const g = globalThis as unknown as { __mongodbElizaAgent?: AgentSingletonState };
  if (!g.__mongodbElizaAgent) {
    g.__mongodbElizaAgent = {
      adapter: null,
      isInitializing: false,
      initPromise: null,
      initError: null,
      startTime: null,
    };
  }
  return g.__mongodbElizaAgent;
}

export interface MongoDBAgentConfig {
  agentId?: string;
  skipMigrations?: boolean;
}

/**
 * Initialize MongoDB adapter for an agent
 */
export async function initializeMongoDBAgent(
  config: MongoDBAgentConfig
): Promise<ReturnType<typeof createMongoDBAdapter> | null> {
  const singleton = getSingleton();

  if (singleton.adapter) {
    console.log(`[${SERVICE}] Returning existing adapter`);
    return singleton.adapter;
  }

  if (singleton.isInitializing && singleton.initPromise) {
    console.log(`[${SERVICE}] Waiting for existing initialization`);
    return singleton.initPromise;
  }

  singleton.isInitializing = true;

  singleton.initPromise = (async () => {
    try {
      console.log(`[${SERVICE}] Starting initialization with MongoDB`);

      console.log(`[${SERVICE}] Connecting to MongoDB...`);
      await connectDB();
      console.log(`[${SERVICE}] MongoDB connection established`);

      const agentId = config.agentId || 'eliza-mongodb-agent';
      console.log(`[${SERVICE}] Agent ID: ${agentId}`);

      console.log(`[${SERVICE}] Creating MongoDB adapter`);
      const adapter = createMongoDBAdapter(agentId);
      await adapter.initialize();
      console.log(`[${SERVICE}] MongoDB adapter initialized`);

      singleton.startTime = Date.now();
      singleton.adapter = adapter;
      singleton.isInitializing = false;
      singleton.initError = null;

      console.log(`[${SERVICE}] Agent initialized successfully with MongoDB`);

      return adapter;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${SERVICE}] Initialization failed:`, errorMessage);

      singleton.initError = error instanceof Error ? error : new Error(errorMessage);
      singleton.isInitializing = false;

      return null;
    }
  })();

  return singleton.initPromise;
}

/**
 * Get the MongoDB adapter (initializes if needed)
 */
export async function getMongoDBAgent(
  config?: MongoDBAgentConfig
): Promise<ReturnType<typeof createMongoDBAdapter> | null> {
  const singleton = getSingleton();
  
  if (singleton.adapter) {
    return singleton.adapter;
  }

  if (!config) {
    console.error(`[${SERVICE}] No config provided and agent not initialized`);
    return null;
  }

  return initializeMongoDBAgent(config);
}

export function getAgentInitError(): Error | null {
  return getSingleton().initError;
}

export function isAgentInitialized(): boolean {
  return getSingleton().adapter !== null;
}

export function getAgentUptime(): number {
  const singleton = getSingleton();
  if (!singleton.startTime) return 0;
  return Date.now() - singleton.startTime;
}

export async function shutdownMongoDBAgent(): Promise<void> {
  const singleton = getSingleton();
  
  console.log(`[${SERVICE}] Shutting down agent`);
  
  if (singleton.adapter) {
    await singleton.adapter.close();
    singleton.adapter = null;
  }
  
  await disconnectDB();
  
  singleton.isInitializing = false;
  singleton.initPromise = null;
  singleton.initError = null;
  singleton.startTime = null;
  
  console.log(`[${SERVICE}] Agent shutdown complete`);
}

export function getAgentStatus(): {
  initialized: boolean;
  uptime: number;
  mongoConnected: boolean;
  error: string | null;
} {
  const singleton = getSingleton();
  return {
    initialized: singleton.adapter !== null,
    uptime: getAgentUptime(),
    mongoConnected: isConnected(),
    error: singleton.initError?.message || null,
  };
}
